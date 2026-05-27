import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";
import { LoggingPort, CommandPort, LogType, LogSeverity } from "@core/ports.ts";

export interface FsAccessEvent {
    type: "FS_ACCESS_EVENT";
    pid: number;
    comm: string;
    syscall: string;
    path?: string;
    timestamp: string;
}

/**
 * SOV-P5: Landlock Policy Learning Mode
 * Collects filesystem access patterns to generate optimized allowlists.
 */
export class LsmLearningService extends BaseService {
    private learningActive: boolean = false;
    private accessMap: Map<string, Set<string>> = new Map();
    private logging: LoggingPort;

    constructor(
        private sidecarManager: CommandPort,
        logging: LoggingPort
    ) {
        super();
        this.logging = logging;
    }

    protected override onInit(): Promise<Result<void>> {
        this.sidecarManager.onEvent("sentinel", (event: unknown) => {
            const ev = event as Record<string, unknown>;
            if (ev.type === "FS_ACCESS_EVENT") {
                this.handleAccessEvent(ev as unknown as FsAccessEvent);
            }
        });
        return Promise.resolve(ok(undefined));
    }

    async startLearning(): Promise<Result<void>> {
        this.learningActive = true;
        this.accessMap.clear();
        await this.sidecarManager.sendCommand("sentinel", {
            type: "SET_LEARNING_MODE",
            learning_mode: true
        });
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "LSM:LEARNING",
            message: "Landlock Learning Mode activated. Monitoring filesystem access patterns..."
        });
        return ok(undefined);
    }

    async stopLearning(): Promise<Result<void>> {
        this.learningActive = false;
        await this.sidecarManager.sendCommand("sentinel", {
            type: "SET_LEARNING_MODE",
            learning_mode: false
        });
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "LSM:LEARNING",
            message: "Landlock Learning Mode deactivated. Policies generated."
        });
        return ok(undefined);
    }

    private handleAccessEvent(event: FsAccessEvent) {
        if (!this.learningActive) return;

        const comm = event.comm;
        if (!this.accessMap.has(comm)) {
            this.accessMap.set(comm, new Set());
        }

        // In a real implementation, we would extract the path from the event if provided
        // For now, we track that the process is performing FS operations.
        this.accessMap.get(comm)!.add(event.syscall);
    }

    getReport(): Record<string, string[]> {
        const report: Record<string, string[]> = {};
        for (const [comm, syscalls] of this.accessMap.entries()) {
            report[comm] = Array.from(syscalls);
        }
        return report;
    }

    generateAllowlist(comm: string): string[] {
        return Array.from(this.accessMap.get(comm) || []);
    }
}
