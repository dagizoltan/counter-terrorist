import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { TimelineRepository } from "@infrastructure/persistence/repositories/timeline_repository.ts";

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

export class IncidentService {
    private repo: TimelineRepository<Incident>;

    constructor(private kv: Deno.Kv, private logging: LoggingPort) {
        this.repo = new TimelineRepository<Incident>(kv, "incidents");
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

    async updateStatus(id: string, status: Incident["status"]) {
        const incident = await this.repo.get(id);
        if (incident) {
            incident.status = status;
            await this.repo.set(id, incident);
        }
    }
}
