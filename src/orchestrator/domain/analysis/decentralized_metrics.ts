import { EventBus } from "./events.ts";
import { LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";

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

        this.interval = setInterval(() => this.broadcastMetrics(), 5000 + (Math.random() * 500));
    }

    override stop() {
        if (this.interval) clearInterval(this.interval);
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
}
