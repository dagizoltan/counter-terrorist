import { ok } from "@core/result.ts";
import { BaseService } from "@core/base_service.ts";
import { CausalGraphService, CausalNode } from "./causal_graph_service.ts";
import { EventBusPort } from "@core/ports.ts";

export interface DashboardMetrics {
    totalEvents: number;
    activeNodes: number;
    threatsDetected: number;
    lastAuditTimestamp: string;
    honeypotHits: number;
    systemHealth: "OPERATIONAL" | "WARNING" | "CRITICAL";
}

export interface Alert {
    id: string;
    timestamp: string;
    type: string;
    data: unknown;
}

/**
 * ViewModelService
 * Maintains a high-performance, in-memory cache of the system state for UI consumption.
 * Updates reactively via the EventBus to eliminate redundant KV scans.
 */
export class ViewModelService extends BaseService {
    private metrics: DashboardMetrics = {
        totalEvents: 0,
        activeNodes: 1,
        threatsDetected: 0,
        lastAuditTimestamp: new Date().toISOString(),
        honeypotHits: 0,
        systemHealth: "OPERATIONAL"
    };

    private recentAlerts: Alert[] = [];
    private readonly MAX_ALERTS = 50;

    private unsubscribers: (() => void)[] = [];
    private causalService?: CausalGraphService;

    constructor() {
        super();
    }

    public setCausalService(service: CausalGraphService) {
        this.causalService = service;
    }

    protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
        return { success: true, data: undefined };
    }

    protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
        this.unsubscribers.forEach(u => u());
        this.unsubscribers = [];
        return ok(undefined);
    }

    override setEventBus(eventBus: EventBusPort) {
        super.setEventBus(eventBus);

        this.unsubscribers.push(this.eventBus!.on("METRIC_UPDATE", (data) => {
            if (data.domain === "audit") {
                this.metrics.totalEvents = (data.data as any).totalEvents;
                this.metrics.lastAuditTimestamp = new Date().toISOString();
            } else if (data.domain === "honeypot") {
                this.metrics.honeypotHits = (data.data as any).totalHits;
            } else if (data.domain === "mesh") {
                this.metrics.activeNodes = (data.data as any).activeNodes;
            }
        }));

        this.unsubscribers.push(this.eventBus!.on("THREAT", (data, event) => {
            this.metrics.threatsDetected++;
            this.addAlert("THREAT", event);
        }));

        this.unsubscribers.push(this.eventBus!.on("UI_BROADCAST", (data) => {
            if (data.type === "TACTICAL_TRIGGER") {
                this.addAlert("TRIGGER", data.data);
            }
        }));
    }

    private addAlert(type: string, data: unknown) {
        const alert: Alert = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            type,
            data
        };
        this.recentAlerts.unshift(alert);
        if (this.recentAlerts.length > this.MAX_ALERTS) {
            this.recentAlerts.pop();
        }
    }

    public getDashboardMetrics(): DashboardMetrics {
        return { ...this.metrics };
    }

    public getRecentAlerts(): Alert[] {
        return [...this.recentAlerts];
    }

    /**
     * SOV-P5: Exposes the forensic causal graph for UI visualization.
     */
    public async getForensicCausalGraph(pid?: number, searchTerm?: string): Promise<Record<string, CausalNode>> {
        if (!this.causalService) return {};
        const res = await this.causalService.reconstructGraph(pid, searchTerm);
        if (res.success) {
            return Object.fromEntries(res.data);
        }
        return {};
    }
}
