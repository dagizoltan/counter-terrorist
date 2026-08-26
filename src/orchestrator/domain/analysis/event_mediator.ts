import { EventBus } from "./events.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";
import { LoggingPort, LogType, LogSeverity, CommandPort } from "../../core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { BroadcastData } from "@interface/ws_handler.ts";
import { Result, ok } from "../../core/result.ts";

import { SentinelIntegration } from "./mediators/SentinelIntegration.ts";
import { FimIntegration } from "./mediators/FimIntegration.ts";
import { NetworkIntegration } from "./mediators/NetworkIntegration.ts";
import { ScannerIntegration } from "./mediators/ScannerIntegration.ts";

import type { ProcessTracker } from "./process_tracker.ts";
import type { CanaryService } from "@domain/protection/canary_service.ts";
import type { GeoIpService } from "./geoip_service.ts";

type SidecarEvent = Record<string, unknown>;

const unpackSidecar = (value: unknown): SidecarEvent =>
  typeof value === "object" && value !== null ? value as SidecarEvent : {} as SidecarEvent;

const unwrapSidecar = (value: unknown): SidecarEvent => {
  const payload = unpackSidecar(value);
  return typeof payload.data === "object" && payload.data !== null
    ? payload.data as SidecarEvent
    : payload;
};

/**
 * EventMediator
 * Orchestrates event routing between infrastructure (sidecars) and domain services.
 * This decouples the core application from specific sidecar event formats.
 */
export class EventMediator extends BaseService {
    private behavioral: BehavioralAnalyzer;
    private sentinelIntegration: SentinelIntegration;
    private fimIntegration: FimIntegration;
    private networkIntegration: NetworkIntegration;
    private scannerIntegration: ScannerIntegration;
    private learningTimeout: number | null = null;

    // Performance: High-volume event batching & Backpressure Throttling
    private syscallBatch: SidecarEvent[] = [];
    private networkBatch: SidecarEvent[] = [];
    private readonly BATCH_THRESHOLD = 50;
    private readonly MAX_QUEUE_DEPTH = 1000;
    private batchTimer?: number;

    protected override async onInit(): Promise<Result<void>> {
        // Lazy resolution of dependencies via Service Locator to prevent God Object coupling
        // and handle circular dependencies during complex system boot.
        const { serviceLocator } = await import("@core/service_locator.ts");

        if (serviceLocator.has("processTracker")) {
            const processTracker = serviceLocator.get<ProcessTracker>("processTracker");
            this.sentinelIntegration.setProcessTracker(processTracker);
        }

        if (serviceLocator.has("canaryService")) {
            const canaryService = serviceLocator.get<CanaryService>("canaryService");
            this.fimIntegration.setCanaryService(canaryService);
        }

        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.learningTimeout) {
            clearTimeout(this.learningTimeout);
            this.learningTimeout = null;
        }
        if (this.batchTimer) {
            clearInterval(this.batchTimer);
        }

        // SOV-06 FIX: Final batch flush on shutdown to prevent telemetry loss
        this.flushBatches();

        if (this.behavioral) {
            await this.behavioral.shutdown();
        }

        await this.logger.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:analysis:event_mediator",
            message: "Event Mediator offline."
        });
        return ok(undefined);
    }

    constructor(
        private eventBusPort: EventBus,
        private broadcast: (msg: BroadcastData) => void,
        logger: LoggingPort,
        private kv?: Deno.Kv,
        behavioral?: BehavioralAnalyzer
    ) {
        super();
        this.logger = logger;
        this.setEventBus(eventBusPort);
        this.eventBus = eventBusPort;
        this.behavioral = behavioral || new BehavioralAnalyzer();
        if (kv) {
            this.behavioral.setKv(kv).catch(err => this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "event_mediator",
                message: `Failed to set KV for behavioral: ${err.message}`
            }));
        }

        this.sentinelIntegration = new SentinelIntegration(eventBusPort, this.behavioral, logger, broadcast, this.flushBatches.bind(this), this.syscallBatch);
        this.fimIntegration = new FimIntegration(eventBusPort, logger, broadcast);
        this.networkIntegration = new NetworkIntegration(eventBusPort, this.behavioral, logger, broadcast, this.flushBatches.bind(this), this.networkBatch);
        this.scannerIntegration = new ScannerIntegration(eventBusPort, logger, broadcast);

        this.behavioral.setLearningMode(true);
        this.learningTimeout = setTimeout(() => {
            this.learningTimeout = null;
            this.behavioral.setLearningMode(false);
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.ACTIVITY,
                severity: LogSeverity.INFO,
                caller: "SECURITY:BEHAVIORAL",
                message: "Neural Defense Learning Phase Complete. Transitioning to Active Enforcement."
            });
        }, 30000);

        this.eventBus?.on("UI_BROADCAST", async (msg: unknown) => {
            if (typeof msg === "object" && msg !== null) {
                // A THREAT with no location is enriched here, at the one point
                // every threat source fans out to the UI, so shadow-ban and
                // behavioural detections get the same provisional geo the
                // curated feed already carries. The client used to invent
                // coordinates for these; now they come from the one resolver.
                const enriched = await this.enrichThreatGeo(msg as BroadcastData);
                this.broadcast(enriched);
            }
        });

        // Periodic batch flush
        this.batchTimer = setInterval(() => this.flushBatches(), 1000);
    }

    private async flushBatches() {
        if (this.syscallBatch.length > 0) {
            // SOV-06 Hardening: Limit batch size to prevent orchestrator loop blocking
            const batch = this.syscallBatch.splice(0, this.MAX_QUEUE_DEPTH);
            await this.eventBus?.emit("EBPF_SYSCALL_BATCH", batch as any);
        }
        if (this.networkBatch.length > 0) {
            const batch = this.networkBatch.splice(0, this.MAX_QUEUE_DEPTH);
            await this.eventBus?.emit("NETWORK_LOG_BATCH", batch as any);
        }
    }

    /**
     * Connects a sidecar manager to the domain mediator.
     */
    wireSidecars(commandPort: CommandPort) {
        // 1. Honeypot Integration
        commandPort.onEvent("decoy", async (response: unknown) => {
            try {
                const payload = (typeof response === "object" && response !== null ? response as SidecarEvent : {} as SidecarEvent);
                const event = (payload.data as SidecarEvent) ?? payload;
                if (typeof event.type === "string" && typeof event.source_ip === "string") {
                    this.broadcast({
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: typeof event.caller === "string" ? event.caller : "decoy:honeypot",
                        message: `Honeypot Trigger: ${event.type} from ${event.source_ip}`,
                        data: event
                    });
                    await this.eventBus?.emit("HONEYPOT", event as any);
                }
            } catch (e) {
                this.handleMediatorError(e as Error, "decoy");
            }
        });

        // 2. eBPF Integration
        commandPort.onEvent("sentinel", async (response: unknown) => {
            try {
                // SOV-06 Hardening: Load-shedding during telemetry flood
                if (this.syscallBatch.length > this.MAX_QUEUE_DEPTH) {
                    this.handleThrottling("sentinel");
                    return;
                }

                const event = unwrapSidecar(response);
                await this.sentinelIntegration.handleEvent(event);
            } catch (e) {
                this.handleMediatorError(e as Error, "sentinel");
            }
        });

        // 3. FIM Integration
        commandPort.onEvent("watchfile", async (response: unknown) => {
            try {
                const event = unwrapSidecar(response);
                const payload = unwrapSidecar(event);
                await this.fimIntegration.handleEvent(payload);
            } catch (e) {
                this.handleMediatorError(e as Error, "watchfile");
            }
        });

        // 4. PCAP Integration
        commandPort.onEvent("netcap", async (response: unknown) => {
            try {
                // SOV-06 Hardening: Load-shedding during network telemetry flood
                if (this.networkBatch.length > this.MAX_QUEUE_DEPTH) {
                    this.handleThrottling("netcap");
                    return;
                }

                const event = unwrapSidecar(response);
                const data = unwrapSidecar(event);
                await this.networkIntegration.handleEvent(event, data);
            } catch (e) {
                this.handleMediatorError(e as Error, "netcap");
            }
        });

        // 5. Scanner Integration
        commandPort.onEvent("analyzer", async (response: unknown) => {
            try {
                const event = unwrapSidecar(response);
                const data = unwrapSidecar(event);
                await this.scannerIntegration.handleEvent(data);
            } catch (e) {
                this.handleMediatorError(e as Error, "analyzer");
            }
        });

        this.logger.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "BOOT",
            message: "Event Mediator: Sidecar routing established"
        });
    }

    /**
     * Standardized error handling for mediator event processing.
     */
    private handleMediatorError(e: Error, sidecar: string) {
        const timestamp = new Date().toISOString();
        const message = `Error processing ${sidecar} event: ${e.message}`;

        this.logger.log({
            timestamp,
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:analysis:event_mediator",
            message
        }).catch(err => {
            console.error(`[MEDIATOR:LOG_FAIL] ${err.message} (Original: ${message})`);
        });
    }

    private lastThrottleLog = 0;
    private handleThrottling(sidecar: string) {
        const now = Date.now();
        // Ratelimit throttle logs to once every 10 seconds
        if (now - this.lastThrottleLog > 10000) {
            this.lastThrottleLog = now;
            this.logger.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "EVENT_MEDIATOR:BACKPRESSURE",
                message: `CRITICAL: High telemetry volume detected from ${sidecar}. Engaging load-shedding to prevent OOM.`
            }).catch(err => {
                console.error(`[MEDIATOR:THROTTLE_FAIL] ${err.message}`);
            });
        }
    }

    /**
     * Broadcasts a manual event to all connected UI clients.
     */
    broadcastEvent(event: BroadcastData) {
        this.broadcast(event);
    }

    private geoIp?: GeoIpService;

    /** Lazily pulled from the locator: geoIp may register after the mediator. */
    private async resolveGeoIp(): Promise<GeoIpService | undefined> {
        if (this.geoIp) return this.geoIp;
        try {
            const { serviceLocator } = await import("@core/service_locator.ts");
            if (serviceLocator.has("geoIp")) {
                this.geoIp = serviceLocator.get("geoIp") as GeoIpService;
            }
        } catch { /* locator not ready */ }
        return this.geoIp;
    }

    /**
     * Attach a location to a THREAT frame that lacks one, resolved from the same
     * provisional GeoIP service the historical feed uses. Non-THREAT frames,
     * already-located ones, and non-IP indicators (domains, hashes) pass
     * through untouched — the client tallies those as ungeolocated rather than
     * plotting a guess.
     */
    async enrichThreatGeo(msg: BroadcastData): Promise<BroadcastData> {
        const m = msg as Record<string, unknown>;
        if (m.type !== "THREAT") return msg;

        const data = m.data as Record<string, unknown> | undefined;
        if (!data || typeof data !== "object") return msg;

        const geo = data.geo as Record<string, unknown> | undefined;
        if (geo && typeof geo.lat === "number" && typeof geo.lon === "number") return msg;

        const indicator = data.indicator ?? data.source ?? data.ip ?? data.src_ip;
        if (typeof indicator !== "string" || !/^[\d.]+$|^[0-9a-fA-F:]+$/.test(indicator)) return msg;

        const geoIp = await this.resolveGeoIp();
        if (!geoIp) return msg;

        try {
            const intel = await geoIp.lookup(indicator);
            if (typeof intel?.lat !== "number" || typeof intel?.lon !== "number") return msg;
            return {
                ...m,
                data: {
                    ...data,
                    geo: {
                        ...(geo ?? {}),
                        country: intel.country,
                        city: intel.city,
                        isp: intel.isp,
                        asn: intel.asn,
                        lat: intel.lat,
                        lon: intel.lon,
                    },
                },
            } as BroadcastData;
        } catch {
            return msg;
        }
    }
}
