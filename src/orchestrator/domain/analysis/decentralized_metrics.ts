import { EventBus } from "./events.ts";
import { LoggingPort } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";
import { secureRandomInt } from "../../core/crypto_utils.ts";

export interface MetricUpdatePayload {
    domain: string;
    data: Record<string, unknown>;
}

export class DecentralizedMetricsService extends BaseService {
    private metrics: Map<string, Record<string, unknown>> = new Map();
    private interval?: number;

    constructor(
        eventBus: EventBus,
        private logging: LoggingPort
    ) {
        super();
        this.setEventBus(eventBus);

        this.eventBus!.on("METRIC_UPDATE", (data: MetricUpdatePayload) => {
            if (data && data.domain) {
                this.metrics.set(data.domain, data.data);
                this.broadcastMetrics();
            }
        });
    }

    protected override async onInit(): Promise<Result<void>> {
        // SOV-M5 FIX: Transition to secure random jitter
        this.interval = setInterval(() => this.broadcastMetrics(), 5000 + secureRandomInt(0, 500));
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.interval) clearInterval(this.interval);
        return ok(undefined);
    }

    private async broadcastMetrics() {
        if (!this.eventBus) return;
        await this.eventBus.emit("UI_BROADCAST", {
            type: "METRICS_SUMMARY",
            data: Object.fromEntries(this.metrics.entries())
        });
    }

    public async recordScan(results: Record<string, string | number | boolean | null>) {
        if (!this.eventBus) return;
        await this.eventBus.emit("METRIC_UPDATE", {
            domain: "scans",
            data: results
        });
    }

    public getLatest(): Record<string, Record<string, unknown>> | null {
        return this.metrics.size > 0 ? Object.fromEntries(this.metrics.entries()) : null;
    }
}
