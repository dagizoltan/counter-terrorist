import { HealthService } from "../analysis/health_service.ts";
import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { TACTICAL_CONSTANTS } from "@core/constants.ts";

/**
 * WatchdogService (The "Phoenix" Pattern)
 * Monitors the health of auxiliary services and attempts to re-initialize them
 * if they enter a FAILED state during runtime.
 */
export class WatchdogService {
    private isRunning = false;
    private restartAttempts: Map<string, number> = new Map();
    private readonly MAX_RESTART_ATTEMPTS = 3;

    constructor(
        private health: HealthService,
        private logging: LoggingPort,
        private reinitService: (name: string) => Promise<boolean>
    ) {}

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        this.logging.log("[WATCHDOG] Phoenix Watchdog engaged. Monitoring auxiliary health.", SyslogSeverity.NOTICE);
        
        setInterval(() => this.checkHealth(), 30000); // Check every 30s
    }

    private async checkHealth() {
        const statuses = this.health.getAllStatuses();
        
        for (const { name, status } of statuses) {
            if (status === "FAILED") {
                const attempts = this.restartAttempts.get(name) || 0;
                
                if (attempts < this.MAX_RESTART_ATTEMPTS) {
                    this.logging.log(`[WATCHDOG] Detected failure in '${name}'. Attempting Phoenix Resurrection (${attempts + 1}/${this.MAX_RESTART_ATTEMPTS})...`, SyslogSeverity.WARNING);
                    
                    const success = await this.reinitService(name);
                    
                    if (success) {
                        this.logging.log(`[WATCHDOG] Service '${name}' successfully resurrected.`, SyslogSeverity.NOTICE);
                        this.restartAttempts.delete(name);
                    } else {
                        this.restartAttempts.set(name, attempts + 1);
                    }
                } else {
                    this.logging.log(`[WATCHDOG] Service '${name}' has reached max restart attempts. Manual intervention required.`, SyslogSeverity.CRITICAL);
                }
            }
        }
    }
}
