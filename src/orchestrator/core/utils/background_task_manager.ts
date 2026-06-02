import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { HealthService } from "@domain/analysis/health_service.ts";

/**
 * BackgroundTaskManager
 * Production-grade coordinator for asynchronous background tasks.
 * Ensures consistent logging, error tracking, and health reporting.
 */
export class BackgroundTaskManager {
    private activeTasks: Set<string> = new Set();

    constructor(
        private logging: LoggingPort,
        private health?: HealthService
    ) {}

    /**
     * Executes a task in the background with full lifecycle tracking.
     */
    run(name: string, task: () => Promise<void>): void {
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
    schedule(name: string, intervalMs: number, task: () => Promise<void>): any {
        const intervalId = setInterval(() => {
            this.run(name, task);
        }, intervalMs);

        return intervalId;
    }

    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }
}
