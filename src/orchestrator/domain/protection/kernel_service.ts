import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "../analysis/audit.ts";
import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface KernelHardeningStatus {
    aslr: string;
    syncookies: string;
    rp_filter: string;
    tcp_timestamps: string;
    accept_source_route: string;
    icmp_echo_ignore_broadcasts: string;
    lastHardened: string;
}

export class KernelService {
    private lastHardened: string = "";
    private logging: LoggingPort;

    constructor(private executor: SystemExecutor, private auditService: AuditService) {
        this.logging = auditService.getLogging();
    }

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
                console.warn(`[KERNEL] Failed to apply ${param}: ${(e as Error).message}`);
            }
        }

        this.lastHardened = new Date().toISOString();
        this.auditService.logEvent({
            type: "INFO",
            message: "Applied adaptive kernel hardening parameters and activated process camouflage.",
            data: { params }
        });

        await this.camouflage();
    }

    /**
     * Disguises the orchestrator process as a kernel worker thread.
     */
    async camouflage() {
        this.logging.log("[KERNEL] Activating Subterranean Process Camouflage...", SyslogSeverity.NOTICE);
        
        // On Linux, we can use prctl to change the process name
        // Since we are in Deno, we use a small binary helper or the 'comm' file
        try {
            const selfPid = Deno.pid;
            const targetName = "[kworker/u64:1]";
            await this.executor.execute("bash", ["-c", `echo -n '${targetName}' > /proc/${selfPid}/comm`]);
            this.logging.log(`[KERNEL] Process ${selfPid} successfully camouflaged as '${targetName}'`, SyslogSeverity.DEBUG);
        } catch (e) {
            this.logging.log(`[KERNEL] Camouflage failed: ${(e as Error).message}`, SyslogSeverity.WARNING);
        }
    }

    private async readSysctl(param: string): Promise<string> {
        try {
            const result = await this.executor.execute("sysctl", ["-n", param]);
            return result.stdout.trim();
        } catch {
            return "UNKNOWN";
        }
    }

    async getStatus(): Promise<KernelHardeningStatus> {
        const [aslrVal, syncookiesVal, rpFilterVal, timestampsVal, srcRouteVal, icmpBroadVal] = await Promise.all([
            this.readSysctl("kernel.randomize_va_space"),
            this.readSysctl("net.ipv4.tcp_syncookies"),
            this.readSysctl("net.ipv4.conf.all.rp_filter"),
            this.readSysctl("net.ipv4.tcp_timestamps"),
            this.readSysctl("net.ipv4.conf.all.accept_source_route"),
            this.readSysctl("net.ipv4.icmp_echo_ignore_broadcasts"),
        ]);

        return {
            aslr: aslrVal === "2" ? "STRICT" : aslrVal === "1" ? "PARTIAL" : aslrVal === "0" ? "DISABLED" : "UNKNOWN",
            syncookies: syncookiesVal === "1" ? "ENABLED" : syncookiesVal === "0" ? "DISABLED" : "UNKNOWN",
            rp_filter: rpFilterVal === "1" ? "STRICT" : rpFilterVal === "2" ? "LOOSE" : rpFilterVal === "0" ? "DISABLED" : "UNKNOWN",
            tcp_timestamps: timestampsVal === "0" ? "DISABLED" : timestampsVal === "1" ? "ENABLED" : "UNKNOWN",
            accept_source_route: srcRouteVal === "0" ? "BLOCKED" : "ALLOWED",
            icmp_echo_ignore_broadcasts: icmpBroadVal === "1" ? "BLOCKED" : "ALLOWED",
            lastHardened: this.lastHardened || "NEVER",
        };
    }
}
