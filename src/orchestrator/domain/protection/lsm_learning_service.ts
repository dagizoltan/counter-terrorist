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

        // SOV-P5: Learning Mode - Store both syscall and path for better Landlock policies
        const entry = event.path ? `${event.syscall}:${event.path}` : event.syscall;
        this.accessMap.get(comm)!.add(entry);
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

    /**
     * SOV-P5: Generate a Landlock profile template.
     */
    generateProfile(comm: string): string {
        const entries = this.generateAllowlist(comm);

        // Group by path to generate structured rules
        const pathMap: Map<string, string[]> = new Map();
        for (const entry of entries) {
            const [syscall, path] = entry.split(":");
            if (path) {
                if (!pathMap.has(path)) pathMap.set(path, []);
                pathMap.get(path)!.push(syscall);
            }
        }

        const structuredRules = Array.from(pathMap.entries()).map(([path, syscalls]) => {
            return `  path "${path}" { allow [${syscalls.join(", ")}] }`;
        }).join("\n");

        const legacyRules = entries.filter(e => !e.includes(":")).map(e => `  syscall "${e}" { allow }`).join("\n");

        return `
# Landlock Profile for ${comm} (Auto-Generated via Learning Mode)
# Date: ${new Date().toISOString()}

profile "${comm}" {
  # Structured Path Rules
${structuredRules}

  # Generic Syscall Rules
${legacyRules}
}
`.trim();
    }
}
