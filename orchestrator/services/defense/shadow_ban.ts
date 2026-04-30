import { SystemExecutor } from "../../infrastructure/system_executor.ts";
import { AuditService } from "./audit.ts";

export class ShadowBanService {
    private throttledIps: Set<string> = new Set();

    private interface: string = "eth0";

    constructor(private executor: SystemExecutor, private auditService: AuditService) {
        this.detectInterface();
    }

    private async detectInterface() {
        try {
            const result = await this.executor.execute("ip", ["route"]);
            const match = result.stdout.match(/default via .* dev (\S+)/);
            if (match && match[1]) {
                this.interface = match[1];
                console.log(`[SHADOW-BAN] Detected interface: ${this.interface}`);
            }
        } catch (e) {
            console.warn(`[SHADOW-BAN] Interface detection failed, defaulting to eth0`);
        }
    }

    async applyShadowBan(ip: string) {
        if (this.throttledIps.has(ip)) return;

        try {
            // Using TC (Traffic Control) for shadow banning
            // 1. Create a qdisc on the interface
            await this.executor.execute("tc", ["qdisc", "add", "dev", this.interface, "root", "handle", "1:", "htb", "default", "10"]);
            
            // 2. Create a class with 1kbps (simulating 1 byte/sec effectively for most tools)
            await this.executor.execute("tc", ["class", "add", "dev", this.interface, "parent", "1:", "classid", "1:1", "htb", "rate", "1kbps", "ceil", "1kbps"]);
            
            // 3. Filter the IP into this class
            await this.executor.execute("tc", ["filter", "add", "dev", this.interface, "protocol", "ip", "parent", "1:", "prio", "1", "u32", "match", "ip", "src", ip, "flowid", "1:1"]);

            this.throttledIps.add(ip);
            this.auditService.logEvent({
                type: "THREAT",
                message: `SHADOW BAN APPLIED: Traffic for ${ip} throttled to 1kbps.`,
                data: { ip, method: "tc_htb" }
            });
        } catch (e) {
            console.warn(`[SHADOW-BAN] Failed to apply to ${ip}: ${e.message}`);
            // Fallback to hard block if TC fails
        }
    }

    async liftShadowBan(ip: string) {
        // Implementation for removing TC filters
        this.throttledIps.delete(ip);
    }
}
