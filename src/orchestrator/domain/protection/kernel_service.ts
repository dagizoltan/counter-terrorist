import { AuditService } from "../analysis/audit.ts";
import { LoggingPort, LogSeverity, LogType, ExecutorPort, CommandPort, TpmPort, ConfigurationPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";

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
    private eventBus?: any;
    private metricsInterval?: number;

    constructor(
        private executor: ExecutorPort,
        private auditService: AuditService,
        private config: ConfigurationPort,
        private sidecarManager?: CommandPort,
        private tpm?: TpmPort
    ) {
        this.logging = auditService.getLogging();
        this.metricsInterval = setInterval(() => this.emitMetrics(), 60000);
    }

    shutdown() {
        if (this.metricsInterval) clearInterval(this.metricsInterval);
    }

    setEventBus(eventBus: any) {
        this.eventBus = eventBus;
    }

    private async emitMetrics() {
        if (!this.eventBus) return;
        const statusRes = await this.getStatus();
        const status = statusRes.success ? statusRes.data : {};
        this.eventBus.emit("METRIC_UPDATE", {
            domain: "kernel",
            data: status
        });
    }

    getTpmManager(): TpmPort | undefined {
        return this.tpm;
    }

    async start(): Promise<Result<void>> {
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
            const res = await this.executor.execute("sysctl", ["-w", param]);
            if (!res.success) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:domain:protection:kernel",
                    message: `Failed to apply ${param}: ${res.stderr}`
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

        return await this.camouflage();
    }

    /**
     * Disguises the orchestrator process as a kernel worker thread.
     */
    async camouflage(): Promise<Result<void>> {
        const enabled = this.config?.getBoolean("STEALTH_ENABLED", true);
        if (!enabled) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:protection:kernel",
                message: "Stealth Mode disabled. Skipping process camouflage."
            });
            return ok(undefined);
        }
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:protection:kernel",
            message: "Activating Subterranean Process Camouflage..."
        });
        
        // On Linux, we can use prctl to change the process name
        // Since we are in Deno, we use a small binary helper or the 'comm' file
        try {
            const selfPid = Deno.pid;
            const targetName = "[kworker/u64:1]";
            const res = await this.executor.execute("/var/lib/cts/scripts/update_comm.sh", [targetName, selfPid.toString()]);
            
            if (!res.success) {
                return err(new Error(`Camouflage update_comm failed: ${res.stderr}`));
            }

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:protection:kernel",
                message: `Process ${selfPid} successfully camouflaged as '${targetName}'`
            });
            return ok(undefined);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:protection:kernel",
                message: `Camouflage failed: ${error.message}`
            });
            return err(error);
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
     * Enforces a process-level restriction via Ring 0 hooks (LSM/Auth/WFP).
     */
    async enforceEnforcement(pid: number, policy: number = 1): Promise<Result<void>> {
        if (!this.sidecarManager) return err(new Error("SidecarManager not available"));

        const os = Deno.build.os;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "KERNEL:ENFORCE",
            message: `Ring 0 Enforcement: Engaging policy ${policy} for PID ${pid}`
        });

        let res;
        if (os === "linux") {
            res = await this.sidecarManager.sendCommand("sentinel", { type: "ENFORCE_PID", pid, policy });
        } else if (os === "darwin") {
            // macOS ESF Auth enforcement
            res = await this.sidecarManager.sendCommand("sentinel-darwin", { type: "UpdatePolicy", blocked_paths: [`/proc/${pid}/`] });
        } else if (os === "windows") {
            // Windows WFP enforcement
            res = await this.sidecarManager.sendCommand("enforcer-win", { type: "AddBlockRule", ip: "0.0.0.0/0", pid });
        } else {
            return err(new Error(`Unsupported OS for enforcement: ${os}`));
        }

        if (!res.success) return err(new Error(`Enforcement failed: ${res.stderr}`));

        this.auditService.logEvent({
            type: "ENFORCEMENT",
            message: `Ring 0 Enforcement active for PID ${pid}`,
            data: { pid, policy, os }
        });
        return ok(undefined);
    }

    /**
     * Enforces a syscall block via eBPF Kernel hooks.
     */
    async blockSyscall(pid: number, syscall: string): Promise<Result<void>> {
        if (!this.sidecarManager) return err(new Error("SidecarManager not available"));
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "KERNEL:LSM",
            message: `LSM Enforcement: Blocking syscall '${syscall}' for PID ${pid}`
        });
        const res = await this.sidecarManager.sendCommand("sentinel", {
            type: "BLOCK_SYSCALL",
            pid,
            syscall
        });

        if (!res.success) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:protection:kernel",
                message: `eBPF syscall block failed: ${res.stderr}`
            });
            return err(new Error(`eBPF syscall block failed: ${res.stderr}`));
        }
        
        this.auditService.logEvent({
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "kernel:lsm",
            message: `LSM Enforcement: Blocked syscall '${syscall}' for process ${pid}`,
            data: { pid, syscall }
        });
        return ok(undefined);
    }

    /**
     * Deploys a global LSM policy to the eBPF agent.
     */
    async enforceLsmPolicy(policy: { blockedSyscalls: string[], restrictedPids: number[] }): Promise<Result<void>> {
        if (!this.sidecarManager) return err(new Error("SidecarManager not available"));
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "KERNEL:LSM",
            message: "Deploying Deep LSM Policy..."
        });
        const res = await this.sidecarManager.sendCommand("sentinel", {
            type: "LSM_POLICY",
            policy
        });

        if (!res.success) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:protection:kernel",
                message: `eBPF LSM policy deployment failed: ${res.stderr}`
            });
            return err(new Error(`eBPF LSM policy deployment failed: ${res.stderr}`));
        }
        return ok(undefined);
    }

    /**
     * SOV-P2: Kernel Lockdown - AppArmor Profile Generation
     * Generates a minimal, hardened AppArmor profile for a sidecar.
     */
    async deployAppArmorProfile(name: string, binaryPath: string): Promise<Result<void>> {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "KERNEL:APPARMOR",
            message: `Generating hardened AppArmor profile for ${name}...`
        });

        const profileName = `cts-sidecar-${name}`;
        const profile = `
# Hardened AppArmor Profile for Sovereign Sidecar: ${name}
# Generated by KernelService

profile ${profileName} ${binaryPath} flags=(attach_disconnected) {
  #include <abstractions/base>

  # System Permissions
  capability net_admin,
  capability sys_admin,
  capability sys_resource,

  # Deny all by default
  deny /etc/passwd w,
  deny /etc/shadow rw,
  deny /home/** rw,
  deny /root/** rw,

  # Allow required access
  /proc/** r,
  /sys/** r,
  /var/lib/cts/bin/${name} mr,
  /var/lib/cts/logs/** rw,

  # Network access
  network inet,
  network inet6,
  network raw,
}
`.trim();

        const tempFile = `/tmp/${profileName}.profile`;
        await Deno.writeTextFile(tempFile, profile);

        try {
            // Deploy profile via privileged SystemExecutor
            const cpRes = await this.executor.execute("cp", [tempFile, `/etc/apparmor.d/${profileName}`]);
            if (!cpRes.success) return err(new Error(`Failed to copy AppArmor profile: ${cpRes.stderr}`));

            const reloadRes = await this.executor.execute("systemctl", ["reload", "apparmor"]);
            if (!reloadRes.success) return err(new Error(`Failed to reload AppArmor: ${reloadRes.stderr}`));

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "KERNEL:APPARMOR",
                message: `AppArmor profile '${profileName}' successfully deployed and enforced.`
            });
            return ok(undefined);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "KERNEL:APPARMOR",
                message: `Failed to deploy AppArmor profile: ${error.message}`
            });
            return err(error);
        }
    }

    async getStatus(): Promise<Result<KernelHardeningStatus>> {
        const [aslrVal, syncookiesVal, rpFilterVal, timestampsVal, srcRouteVal, icmpBroadVal] = await Promise.all([
            this.readSysctl("kernel.randomize_va_space"),
            this.readSysctl("net.ipv4.tcp_syncookies"),
            this.readSysctl("net.ipv4.conf.all.rp_filter"),
            this.readSysctl("net.ipv4.tcp_timestamps"),
            this.readSysctl("net.ipv4.conf.all.accept_source_route"),
            this.readSysctl("net.ipv4.icmp_echo_ignore_broadcasts"),
        ]);

        return ok({
            aslr: aslrVal === "2" ? "STRICT" : aslrVal === "1" ? "PARTIAL" : aslrVal === "0" ? "DISABLED" : "UNKNOWN",
            syncookies: syncookiesVal === "1" ? "ENABLED" : syncookiesVal === "0" ? "DISABLED" : "UNKNOWN",
            rp_filter: rpFilterVal === "1" ? "STRICT" : rpFilterVal === "2" ? "LOOSE" : rpFilterVal === "0" ? "DISABLED" : "UNKNOWN",
            tcp_timestamps: timestampsVal === "0" ? "DISABLED" : timestampsVal === "1" ? "ENABLED" : "UNKNOWN",
            accept_source_route: srcRouteVal === "0" ? "BLOCKED" : "ALLOWED",
            icmp_echo_ignore_broadcasts: icmpBroadVal === "1" ? "BLOCKED" : "ALLOWED",
            lastHardened: this.lastHardened || "NEVER",
        });
    }
}
