import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { HealthService } from "@domain/analysis/health_service.ts";

/**
 * BackgroundTaskManager
 * Production-grade coordinator for asynchronous background tasks.
 * Ensures consistent logging, error tracking, and health reporting.
 */
export class BackgroundTaskManager {
    private activeTasks: Set<string> = new Set();
    private scheduledTasks: Map<string, number> = new Map();

    constructor(
        private logging: LoggingPort,
        private health?: HealthService
    ) {}

    /**
     * Executes a task in the background with full lifecycle tracking.
     */
    run(name: string, task: (signal?: AbortSignal) => Promise<void>): void {
        this.activeTasks.add(name);

        task()
            .then(() => {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.ACTIVITY,
                    severity: LogSeverity.DEBUG,
                    caller: `TASK:${name}`,
                    message: `Background task completed successfully.`
                }).catch(() => {});
            })
            .catch((error: Error) => {
                const message = `Background task '${name}' failed: ${error.message}`;
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: `TASK:${name}`,
                    message,
                    payload: { stack: error.stack }
                }).catch(() => {});

                if (this.health) {
                    this.health.reportStatus(name, "DEGRADED", message);
                }
            })
            .finally(() => {
                this.activeTasks.delete(name);
            });
    }

    /**
     * Executes a task repeatedly with a fixed interval.
     */
    schedule(name: string, intervalMs: number, task: () => Promise<void>): number {
        if (this.scheduledTasks.has(name)) {
            clearInterval(this.scheduledTasks.get(name));
        }

        const intervalId = setInterval(() => {
            this.run(name, task);
        }, intervalMs);

        this.scheduledTasks.set(name, intervalId);
        return intervalId;
    }

    /**
     * Stops a specific scheduled task.
     */
    stop(name: string): void {
        const id = this.scheduledTasks.get(name);
        if (id !== undefined) {
            clearInterval(id);
            this.scheduledTasks.delete(name);
        }
    }

    /**
     * Terminates all scheduled tasks.
     */
    shutdown(): void {
        for (const id of this.scheduledTasks.values()) {
            clearInterval(id);
        }
        this.scheduledTasks.clear();
    }

    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }
}
