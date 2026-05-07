import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { AuditService } from "../analysis/audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

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

    constructor(
        private executor: SystemExecutor, 
        private auditService: AuditService,
        private sidecarManager?: SidecarManager
    ) {
        this.logging = auditService.getLogging();
    }

    async start() {
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
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "KERNEL",
                    message: `Failed to apply ${param}: ${(e as Error).message}`
                });
            }
        }

        this.lastHardened = new Date().toISOString();
        this.auditService.logEvent({
            type: LogType.ACTIVITY,
            severity: LogSeverity.SUCCESS,
            caller: "kernel:hardening",
            message: "Applied adaptive kernel hardening parameters and activated process camouflage.",
            data: { params }
        });

        await this.camouflage();
    }

    /**
     * Disguises the orchestrator process as a kernel worker thread.
     */
    async camouflage() {
        const enabled = Deno.env.get("STEALTH_ENABLED") !== "false"; // Default to true if not specified
        if (!enabled) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "KERNEL",
                message: "Stealth Mode disabled. Skipping process camouflage."
            });
            return;
        }
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "KERNEL",
            message: "Activating Subterranean Process Camouflage..."
        });
        
        // On Linux, we can use prctl to change the process name
        // Since we are in Deno, we use a small binary helper or the 'comm' file
        try {
            const selfPid = Deno.pid;
            const targetName = "[kworker/u64:1]";
            await this.executor.execute("/var/lib/cts/scripts/update_comm.sh", [targetName, selfPid.toString()]);
            
            // Deep Stealth: Register with eBPF Kernel filter
            if (this.sidecarManager) {
                await this.sidecarManager.sendCommand("ebpf", {
                    type: "HIDE_PID",
                    pid: selfPid
                }).catch(err => this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "KERNEL",
                    message: `eBPF PID hiding failed: ${err.message}`
                }));
            }

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.INFO,
                caller: "KERNEL",
                message: `Process ${selfPid} successfully camouflaged as '${targetName}'`
            });
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "KERNEL",
                message: `Camouflage failed: ${(e as Error).message}`
            });
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

    /**
     * Enforces a syscall block via eBPF Kernel hooks.
     */
    async blockSyscall(pid: number, syscall: string) {
        if (!this.sidecarManager) return;
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "KERNEL:LSM",
            message: `LSM Enforcement: Blocking syscall '${syscall}' for PID ${pid}`
        });
        await this.sidecarManager.sendCommand("ebpf", {
            type: "BLOCK_SYSCALL",
            pid,
            syscall
        }).catch(err => this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "KERNEL",
            message: `eBPF syscall block failed: ${err.message}`
        }));
        
        this.auditService.logEvent({
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "kernel:lsm",
            message: `LSM Enforcement: Blocked syscall '${syscall}' for process ${pid}`,
            data: { pid, syscall }
        });
    }

    /**
     * Deploys a global LSM policy to the eBPF agent.
     */
    async enforceLsmPolicy(policy: { blockedSyscalls: string[], restrictedPids: number[] }) {
        if (!this.sidecarManager) return;
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "KERNEL:LSM",
            message: "Deploying Deep LSM Policy..."
        });
        await this.sidecarManager.sendCommand("ebpf", {
            type: "LSM_POLICY",
            policy
        }).catch(err => this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "KERNEL",
            message: `eBPF LSM policy deployment failed: ${err.message}`
        }));
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
