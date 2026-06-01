import { EventBus } from "./events.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { CanaryService } from "../protection/canary_service.ts";
import { BehavioralAnalyzer } from "./behavioral_analyzer.ts";
import { LoggingPort, LogType, LogSeverity, CommandPort } from "../../core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { BroadcastData } from "@interface/ws_handler.ts";
import { Result, ok } from "../../core/result.ts";

import { SentinelIntegration } from "./mediators/SentinelIntegration.ts";
import { FimIntegration } from "./mediators/FimIntegration.ts";
import { NetworkIntegration } from "./mediators/NetworkIntegration.ts";
import { ScannerIntegration } from "./mediators/ScannerIntegration.ts";

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

    // Performance: High-volume event batching
    private syscallBatch: SidecarEvent[] = [];
    private networkBatch: SidecarEvent[] = [];
    private readonly BATCH_THRESHOLD = 50;
    private batchTimer?: number;

    protected override onInit(): Promise<Result<void>> {
        return Promise.resolve(ok(undefined));
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
        private processTracker: ProcessTracker,
        private canaryService: CanaryService,
        private broadcast: (msg: BroadcastData) => void,
        private logger: LoggingPort,
        private kv?: Deno.Kv
    ) {
        super();
        this.setEventBus(eventBusPort);
        this.eventBus = eventBusPort;
        this.behavioral = new BehavioralAnalyzer();
        if (kv) {
            this.behavioral.setKv(kv).catch(err => this.logging.log({ timestamp: new Date().toISOString(), type: LogType.GENERIC, severity: LogSeverity.ERROR, caller: "event_mediator", message: `Failed to set KV for behavioral: ${err.message}` }).catch(() => {}));
        }

        this.sentinelIntegration = new SentinelIntegration(eventBusPort, processTracker, this.behavioral, logger, broadcast, this.flushBatches.bind(this), this.syscallBatch);
        this.fimIntegration = new FimIntegration(eventBusPort, canaryService, logger, broadcast);
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

        this.eventBus?.on("UI_BROADCAST", (msg: unknown) => {
            if (typeof msg === "object" && msg !== null) {
                this.broadcast(msg as BroadcastData);
            }
        });

        // Periodic batch flush
        this.batchTimer = setInterval(() => this.flushBatches(), 1000);
    }

    private flushBatches() {
        if (this.syscallBatch.length > 0) {
            this.eventBus?.emit("EBPF_SYSCALL_BATCH" as any, [...this.syscallBatch] as any);
            this.syscallBatch = [];
        }
        if (this.networkBatch.length > 0) {
            this.eventBus?.emit("NETWORK_LOG_BATCH" as any, [...this.networkBatch] as any);
            this.networkBatch = [];
        }
    }

    /**
     * Connects a sidecar manager to the domain mediator.
     */
    wireSidecars(commandPort: CommandPort) {
        // 1. Honeypot Integration
        commandPort.onEvent("decoy", (response: unknown) => {
            try {
                const payload = (typeof response === "object" && response !== null ? response as SidecarEvent : {} as SidecarEvent);
                const event = (payload.data as SidecarEvent) ?? payload;
                this.broadcast({
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: typeof event.caller === "string" ? event.caller : "decoy:honeypot",
                    message: `Honeypot Trigger: ${typeof event.type === "string" ? event.type : "unknown"} from ${typeof event.source_ip === "string" ? event.source_ip : "remote"}`,
                    data: event
                });
                this.eventBus?.emit("HONEYPOT" as any, event as any);
            } catch (e) {
                this.handleMediatorError(e as Error, "decoy");
            }
        });

        // 2. eBPF Integration
        commandPort.onEvent("sentinel", async (response: unknown) => {
            try {
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

    private handleMediatorError(e: Error, sidecar: string) {
        this.logger.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:analysis:event_mediator",
            message: `Error processing ${sidecar} event: ${e.message}`
        }).catch(err => this.logging.log({ timestamp: new Date().toISOString(), type: LogType.GENERIC, severity: LogSeverity.ERROR, caller: "event_mediator", message: `Background task failure: ${err.message}` }).catch(() => {}));
    }

    /**
     * Broadcasts a manual event to all connected UI clients.
     */
    broadcastEvent(event: BroadcastData) {
        this.broadcast(event);
    }
}
