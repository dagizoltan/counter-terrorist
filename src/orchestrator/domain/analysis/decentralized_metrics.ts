import { EventBus } from "./events.ts";
import { LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";

export class DecentralizedMetricsService extends BaseService {
    private metrics: Map<string, any> = new Map();
    private interval?: number;

    constructor(
        eventBus: EventBus,
        private logging: any
    ) {
        super();
        this.setEventBus(eventBus);

        this.eventBus!.on("METRIC_UPDATE", (event: any) => {
            if (event && event.domain) {
                this.metrics.set(event.domain, event.data);
                this.broadcastMetrics();
            }
        });
    }

    override async init(): Promise<Result<void>> {
        if (this.initialized) return ok(undefined);
        this.interval = setInterval(() => this.broadcastMetrics(), 5000 + (Math.random() * 500));
        this.initialized = true;
        return ok(undefined);
    }

    override async shutdown(): Promise<Result<void>> {
        if (this.interval) clearInterval(this.interval);
        this.initialized = false;
        return await super.shutdown();
    }

    private broadcastMetrics() {
        if (!this.eventBus) return;
        this.eventBus.emit("UI_BROADCAST", {
            type: "METRICS_SUMMARY",
            data: Object.fromEntries(this.metrics.entries())
        });
    }

    public recordScan(results: any) {
        this.eventBus!.emit("METRIC_UPDATE", {
            domain: "scans",
            data: results
        });
    }

    public getLatest(): Record<string, any> | null {
        return this.metrics.size > 0 ? Object.fromEntries(this.metrics.entries()) : null;
    }
}
