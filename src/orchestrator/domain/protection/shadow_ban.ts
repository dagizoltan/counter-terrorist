import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "../analysis/audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

export class ShadowBanService {
    private throttledIps: Set<string> = new Set();
    private logging: LoggingPort;
    private interface: string = "eth0";

    constructor(private executor: SystemExecutor, private auditService: AuditService) {
        this.logging = auditService.getLogging();
        this.detectInterface();
    }

    private async detectInterface() {
        try {
            const result = await this.executor.execute("ip", ["route"]);
            const match = result.stdout.match(/default via .* dev (\S+)/);
            if (match && match[1]) {
                this.interface = match[1];
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.DEBUG,
                    severity: LogSeverity.INFO,
                    caller: "orchestrator:domain:protection:shadow_ban",
                    message: `Detected interface: ${this.interface}`
                });
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:protection:shadow_ban",
                message: "Interface detection failed, defaulting to eth0"
            });
        }
    }

    async applyShadowBan(ip: string) {
        if (this.throttledIps.has(ip)) return;

        try {
            // Using TC (Traffic Control) for shadow banning
            // 1. Add qdisc if not exists
            await this.executor.execute("tc", ["qdisc", "add", "dev", this.interface, "root", "handle", "1:", "htb", "default", "10"]).catch(() => {});
            
            // 2. Create a class for shadow banning (ID 1:2 to avoid conflict with firewall provider)
            await this.executor.execute("tc", ["class", "add", "dev", this.interface, "parent", "1:", "classid", "1:2", "htb", "rate", "1kbps", "ceil", "1kbps"]).catch(() => {});
            
            // 3. Filter the IP into this class
            await this.executor.execute("tc", ["filter", "add", "dev", this.interface, "protocol", "ip", "parent", "1:", "prio", "1", "u32", "match", "ip", "src", ip, "flowid", "1:2"]);

            this.throttledIps.add(ip);
            this.auditService.logEvent({
                type: "THREAT",
                message: `SHADOW BAN APPLIED: Traffic for ${ip} throttled to 1kbps.`,
                data: { ip, method: "tc_htb" }
            });
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:protection:shadow_ban",
                message: `Failed to apply to ${ip}: ${(e as Error).message}`
            });
            // Fallback to hard block if TC fails
        }
    }

    async liftShadowBan(ip: string) {
        // Implementation for removing TC filters
        this.throttledIps.delete(ip);
    }
}
