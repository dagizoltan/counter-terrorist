import { ok } from "@core/result.ts";
import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { TimelineRepository } from "@infrastructure/persistence/repositories/timeline_repository.ts";
import { BaseService } from "@core/base_service.ts";

export interface Incident {
    id: string;
    timestamp: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    title: string;
    description: string;
    source: string;
    status: "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
    indicators: string[];
}

export class IncidentService extends BaseService {
    private repo: TimelineRepository<Incident>;

    constructor(private kv: Deno.Kv, private logging: LoggingPort) {
        super();
        this.repo = new TimelineRepository<Incident>(kv, "incidents");
    }

    protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
        return { success: true, data: undefined };
    }

    protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
        return ok(undefined);
    }

    async reportIncident(incident: Omit<Incident, "id" | "timestamp" | "status">) {
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const entry: Incident = { ...incident, id, timestamp, status: "OPEN" };
        
        await this.repo.set(id, entry);
        this.logging.logLegacy(`[INCIDENT] ${entry.severity}: ${entry.title}`, SyslogSeverity.NOTICE);
    }

    async getIncidents(limit = 50): Promise<Incident[]> {
        return await this.repo.getLatest(limit);
    }

    /**
     * Returns the total count of reported incidents (BUG-5.6 FIX)
     */
    async count(): Promise<number> {
        return await this.repo.count();
    }

    async updateStatus(id: string, status: Incident["status"]) {
        // BUG-5.6 FIX: Efficient composite key lookup for status updates
        // TimelineRepository uses [prefix, timestamp, id]

        // We first check the fast index if available (FUTURE: implement id mapping)
        // For now, we still scan but with better awareness of the key structure
        const iter = this.kv.list<Incident>({ prefix: ["incidents"] }, { reverse: true });
        for await (const entry of iter) {
            if (entry.value.id === id) {
                const incident = entry.value;
                incident.status = status;

                const ts = new Date(incident.timestamp).getTime();
                const res = await this.kv.atomic()
                    .check(entry) // Optimistic concurrency control
                    .set(["incidents", ts, id], incident)
                    .commit();

                if (!res.ok) throw new Error(`Failed to update incident status for ${id} (conflict)`);
                break;
            }
        }
    }
}
