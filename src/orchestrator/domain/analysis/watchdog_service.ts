import { HealthService } from "../analysis/health_service.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

/**
 * WatchdogService (The "Phoenix" Pattern)
 * Monitors the health of auxiliary services and attempts to re-initialize them
 * if they enter a FAILED state during runtime.
 */
export class WatchdogService extends BaseService {
    private isRunning = false;
    private restartAttempts: Map<string, number> = new Map();
    private readonly MAX_RESTART_ATTEMPTS = 3;
    private intervalId?: ReturnType<typeof setInterval>;

    constructor(
        private health: HealthService,
        private logging: LoggingPort,
        private reinitService: (name: string) => Promise<boolean>
    ) {
        super();
    }

    protected override async onInit(): Promise<Result<void>> {
        this.start();
        return ok(undefined);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "WATCHDOG",
            message: "Phoenix Watchdog engaged. Monitoring auxiliary health."
        });
        
        this.intervalId = setInterval(() => this.checkHealth(), 30000); // Check every 30s
    }

    protected override async onShutdown(): Promise<Result<void>> {
        this.isRunning = false;
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        return ok(undefined);
    }

    private async checkHealth() {
        const statuses = this.health.getAllStatuses();
        
        for (const { name, status } of statuses) {
            if (status === "FAILED") {
                const attempts = this.restartAttempts.get(name) || 0;
                
                if (attempts < this.MAX_RESTART_ATTEMPTS) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.WARNING,
                        caller: "WATCHDOG",
                        message: `Detected failure in '${name}'. Attempting Phoenix Resurrection (${attempts + 1}/${this.MAX_RESTART_ATTEMPTS})...`
                    });
                    
                    const success = await this.reinitService(name);
                    
                    if (success) {
                        this.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.GENERIC,
                            severity: LogSeverity.SUCCESS,
                            caller: "WATCHDOG",
                            message: `Service '${name}' successfully resurrected.`
                        });
                        this.restartAttempts.delete(name);
                    } else {
                        this.restartAttempts.set(name, attempts + 1);
                    }
                } else {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "WATCHDOG",
                        message: `Service '${name}' has reached max restart attempts. Manual intervention required.`
                    });
                }
            }
        }
    }
}
