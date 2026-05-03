import { LoggingPort } from "../../core/ports.ts";

export type SubsystemStatus = "BOOTING" | "OPERATIONAL" | "DEGRADED" | "FAILED";

export interface SubsystemHealth {
    name: string;
    status: SubsystemStatus;
    lastUpdate: number;
    error?: string;
}

/**
 * HealthService
 * Central registry for monitoring the operational status of all background subsystems.
 */
export class HealthService {
    private states: Map<string, SubsystemHealth> = new Map();

    constructor(private logger: LoggingPort) {}

    reportStatus(name: string, status: SubsystemStatus, error?: string) {
        this.states.set(name, {
            name,
            status,
            lastUpdate: Date.now(),
            error
        });

        if (status === "FAILED") {
            this.logger.log(`Subsystem Failure: ${name} - ${error}`, 1, "HEALTH");
        } else if (status === "OPERATIONAL") {
            this.logger.log(`Subsystem Operational: ${name}`, 6, "HEALTH");
        }
    }

    getAllStatuses(): SubsystemHealth[] {
        return Array.from(this.states.values());
    }

    isFullyOperational(): boolean {
        return Array.from(this.states.values()).every(s => s.status === "OPERATIONAL");
    }

    getGlobalSeverity(): "SUCCESS" | "WARNING" | "DANGER" {
        const states = Array.from(this.states.values());
        if (states.some(s => s.status === "FAILED")) return "DANGER";
        if (states.some(s => s.status === "DEGRADED" || s.status === "BOOTING")) return "WARNING";
        return "SUCCESS";
    }
}
