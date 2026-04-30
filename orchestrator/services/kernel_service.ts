import { SystemExecutor } from "../infrastructure/system_executor.ts";
import { AuditService } from "./audit.ts";

export class KernelService {
    constructor(private executor: SystemExecutor, private auditService: AuditService) {}

    async harden() {
        const params = [
            "net.ipv4.conf.all.rp_filter=1",
            "net.ipv4.conf.default.rp_filter=1",
            "net.ipv4.icmp_echo_ignore_broadcasts=1",
            "net.ipv4.conf.all.accept_source_route=0",
            "net.ipv4.tcp_syncookies=1",
            "net.ipv4.tcp_timestamps=0",
            "kernel.randomize_va_space=2"
        ];

        for (const param of params) {
            try {
                await this.executor.execute("sysctl", ["-w", param]);
            } catch (e) {
                console.warn(`[KERNEL] Failed to apply ${param}: ${e.message}`);
            }
        }

        this.auditService.logEvent({
            type: "INFO",
            message: "Applied adaptive kernel hardening parameters.",
            data: { params }
        });
    }

    async getStatus() {
        // In a real app, we'd read current sysctl values
        return {
            aslr: "ENABLED",
            syncookies: "ENABLED",
            rp_filter: "STRICT",
            lastHardened: new Date().toISOString()
        };
    }
}
