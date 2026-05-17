import { SystemMetrics } from "./metrics_service.ts";
import { LogSeverity, LogType, LoggingPort } from "@core/ports.ts";
import { EventBus } from "./events.ts";

/**
 * Decentralized Metrics Service
 * No longer a "God Object". Listens to METRIC_UPDATE events from individual domains.
 */
export class DecentralizedMetricsService {
    private cachedMetrics: Partial<SystemMetrics> = {};
    private isRunning = false;
    private interval?: number;

    constructor(
        private eventBus: EventBus,
        private logging: LoggingPort,
        private broadcast: (data: any) => void
    ) {
        this.wireEvents();
        this.start();
    }

    private wireEvents() {
        this.eventBus.on("METRIC_UPDATE", (payload: { domain: string, data: any }) => {
            const { domain, data } = payload;
            (this.cachedMetrics as any)[domain] = data;

            // Real-time broadcast for high-frequency updates if needed
            if (domain === "firewall" || domain === "node") {
                this.broadcastMetrics();
            }
        });
    }

    private start() {
        this.isRunning = true;
        this.interval = setInterval(() => this.broadcastMetrics(), 5000);
    }

    public stop() {
        this.isRunning = false;
        if (this.interval) clearInterval(this.interval);
    }

    private broadcastMetrics() {
        if (!this.isRunning) return;

        this.broadcast({
            type: "DEBUG",
            subType: "METRICS_UPDATE",
            data: this.cachedMetrics
        });
    }

    getLatest(): SystemMetrics {
        return this.cachedMetrics as SystemMetrics;
    }
}
