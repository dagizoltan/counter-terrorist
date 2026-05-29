import { LoggingPort, LogType, LogSeverity } from "@core/ports.ts";

/**
 * SOV-P5: HeartbeatMonitor
 * Decoupled utility for monitoring sidecar heartbeats.
 */
export class HeartbeatMonitor {
    private lastHeartbeat: Map<string, number> = new Map();
    private heartbeatInterval?: number;

    constructor(
        private logging: LoggingPort,
        private onTimeout: (name: string) => void
    ) {}

    start(getActiveSidecars: () => string[]) {
        const HEARTBEAT_TIMEOUT = 5000;
        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();
            const active = getActiveSidecars();
            for (const [name, last] of this.lastHeartbeat.entries()) {
                if (active.includes(name) && now - last > HEARTBEAT_TIMEOUT) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "infra:runtime:heartbeat",
                        message: `CRITICAL: Sidecar ${name} missed heartbeats for 5s. Potential hang detected.`
                    });
                    this.onTimeout(name);
                    this.lastHeartbeat.delete(name);
                }
            }
        }, 2000);
    }

    recordHeartbeat(name: string) {
        this.lastHeartbeat.set(name, Date.now());
    }

    stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
    }
}
