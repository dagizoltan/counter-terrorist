import { AuditService } from "../analysis/audit.ts";
import { LoggingPort, LogSeverity, LogType, ExecutorPort, CommandPort, TpmPort, ConfigurationPort } from "@core/ports.ts";
import { Result, ok, err } from "@core/result.ts";
import { BaseService } from "@core/base_service.ts";

export interface KernelHardeningStatus {
    aslr: string;
    syncookies: string;
    rp_filter: string;
    tcp_timestamps: string;
    accept_source_route: string;
    icmp_echo_ignore_broadcasts: string;
    lastHardened: string;
}

export class KernelService extends BaseService {
    private lastHardened: string = "";
    private logging: LoggingPort;
    private metricsInterval?: any;

    constructor(
        private executor: ExecutorPort,
        private auditService: AuditService,
        private config: ConfigurationPort,
        private sidecarManager: CommandPort,
        private tpm?: TpmPort
    ) {
        super();
        this.logging = auditService.getLogging();
    }

    protected override async onInit(): Promise<Result<void>> {
        this.metricsInterval = setInterval(() => this.emitMetrics(), 60000);
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = undefined;
        }

        // Restore process name on shutdown if camouflaged
        const stealth = this.config?.getBoolean("STEALTH_ENABLED", true);
        if (stealth && Deno.build.os === "linux") {
            try {
                await this.executor.execute("/var/lib/cts/scripts/update_comm.sh", ["deno", Deno.pid.toString()]);
            } catch {
                // Ignore restoration failures during shutdown
            }
        }

        return ok(undefined);
    }

    private async emitMetrics() {
        if (!this.eventBus) return;
        const statusRes = await this.getStatus();
        const status = statusRes.success ? statusRes.data : {};
        await this.eventBus.emit("METRIC_UPDATE", {
            domain: "kernel",
            data: status
        });

        // SOV-P5: Runtime Kernel Hook Profiling & Auto-Throttling
        if (this.sidecarManager) {
            const sentinelStatus = await this.sidecarManager.sendCommand("sentinel", "GET_STATUS");
            if (sentinelStatus.success && sentinelStatus.data) {
                this.analyzeHookPerformance(sentinelStatus.data as Record<string, { avg_ns: number, count: number }>);
            }
        }
    }

    /**
     * Auto-Throttling: Detects "hot" hooks and programmatically tightens access
     * or alerts the operator when kernel-side latency spikes are detected.
     */
    private async analyzeHookPerformance(stats: Record<string, { avg_ns: number, count: number }>) {
        const LATENCY_THRESHOLD_NS = 50000; // 50 microseconds

        for (const [hookId, data] of Object.entries(stats)) {
            if (data.avg_ns > LATENCY_THRESHOLD_NS) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "KERNEL:THROTTLE",
                    message: `HOT HOOK DETECTED: Hook ${hookId} is causing latency spikes (avg ${data.avg_ns}ns). Engaging adaptive throttling.`
                });

                // SOV-P5: Dynamic eBPF Adaptive Throttling
                // Programmatically disable "hot" hooks to maintain system stability.
                if (this.sidecarManager) {
                    await this.sidecarManager.sendCommand("sentinel", {
                        type: "UPDATE_HOOK_CONTROL",
                        hook_id: parseInt(hookId),
                        enabled: false
                    });
                }

                if (this.eventBus) {
                    await this.eventBus.emit("SIDECAR_ALERT" as any, {
                        sidecar: "sentinel",
                        type: "PERFORMANCE_DEGRADED",
                        message: `Hook ${hookId} latency spike: ${data.avg_ns}ns. Hook has been temporarily disabled.`,
                        data: { hookId, ...data }
                    } as any);
                }
            }
        }
    }

    getTpmManager(): TpmPort | undefined {
        return this.tpm;
    }

    async start(): Promise<Result<void>> {
        // SOV-P4: Orchestrator eBPF Policy Hardening
        // Deploy a "Default Deny" syscall policy for the Orchestrator itself.
        if (Deno.build.os === "linux") {
            const selfPid = Deno.pid;
            const allowlist = [
                "read", "write", "open", "close", "fstat", "mmap", "munmap", "brk",
                "rt_sigaction", "rt_sigprocmask", "rt_sigreturn", "ioctl", "pread64",
                "pwrite64", "access", "pipe", "select", "sched_yield", "mremap",
                "getpid", "getuid", "getgid", "setuid", "setgid", "geteuid", "getegid",
                "socket", "connect", "accept", "sendto", "recvfrom", "setsockopt",
                "getsockopt", "shutdown", "bind", "listen", "getsockname", "getpeername",
                "clone", "execve", "wait4", "kill", "fcntl", "flock", "fsync",
                "getdents", "getcwd", "chdir", "rename", "mkdir", "rmdir", "unlink",
                "chmod", "chown", "lchown", "utime", "capget", "capset", "prctl"
            ];

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "KERNEL:LSM",
                message: `Applying eBPF Default Deny policy for Orchestrator (PID ${selfPid})...`
            });

            await this.sidecarManager.sendCommand("sentinel", {
                type: "LSM_SYSCALL_ALLOWLIST",
                pid: selfPid,
                allowed_syscalls: allowlist
            });

            // SOV-P5: Implementation of "Quiet Mode" & Self-Enforcement
            await this.initializeQuietMode();
            await this.initializeSelfEnforcement();
        }

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

        const camouflageResult = await this.camouflage();
        if (!camouflageResult.success && this.config?.getEnv("ENVIRONMENT") !== "production") {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:protection:kernel",
                message: "Kernel camouflage failed in non-production mode. Continuing without stealth fallback."
            });
            return ok(undefined);
        }

        return camouflageResult;
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
        // Since we are in Deno, we can either use the helper script or update /proc directly.
        try {
            const selfPid = Deno.pid;
            const targetName = "[kworker/u64:1]";
            const helperPath = "/var/lib/cts/scripts/update_comm.sh";
            let usedFallback = false;

            if (await this.pathExists(helperPath)) {
                const res = await this.executor.execute(helperPath, [targetName, selfPid.toString()]);
                if (!res.success) {
                    throw new Error(`Camouflage update_comm failed: ${res.stderr}`);
                }
            } else {
                const commPath = `/proc/${selfPid}/comm`;
                await Deno.writeTextFile(commPath, targetName);
                usedFallback = true;
            }

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:protection:kernel",
                message: `Process ${selfPid} successfully camouflaged as '${targetName}'${usedFallback ? " using direct /proc write" : ""}`
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

    private async pathExists(path: string): Promise<boolean> {
        try {
            const stat = await Deno.stat(path);
            return stat && stat.isFile ? true : false;
        } catch {
            return false;
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
     * SOV-P5: Implement in-kernel event suppression for trusted processes.
     */
    private async initializeQuietMode() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.DEBUG,
            severity: LogSeverity.INFO,
            caller: "KERNEL:QUIET",
            message: "Engaging in-kernel Quiet Mode for trusted sidecars..."
        });

        const trustedComms = ["deno", "enforcer", "sentinel", "watchfile", "netcap", "analyzer", "decoy"];
        for (const comm of trustedComms) {
            await this.sidecarManager.sendCommand("sentinel", { type: "TRUST_COMM", comm }).catch(() => {});
        }
    }

    /**
     * SOV-P5: Principle of Least Privilege - Orchestrator Self-Enforcement (Egress Gating).
     */
    private async initializeSelfEnforcement() {
        const gateway = typeof this.config?.getEnv === "function" ? this.config.getEnv("GATEWAY_IP") : undefined;
        // In a real mesh, we would get these from MeshManager.
        // For the static initialization, we use core infrastructure IPs.
        const trustedIps = [
            "1.1.1.1", "8.8.8.8", // DNS
            ...(gateway ? [gateway] : [])
        ].filter(Boolean);

        await this.sidecarManager.sendCommand("sentinel", {
            type: "RESTRICT_EGRESS",
            pid: Deno.pid,
            allowed_ips: trustedIps
        }).catch(() => {});
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
        
        const os = Deno.build.os;
        if (os !== "linux") {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:protection:kernel",
                message: `LSM Syscall blocking bypassed for non-Linux platform: ${os}`
            });
            return ok(undefined);
        }

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
     * Transitioned from AppArmor to Dynamic Landlock FS Gating.
     * Programmatically tightens filesystem access for specific PIDs based on behavioral scores.
     */
    async enforceLandlockGating(pid: number, path: string): Promise<Result<void>> {
        if (!this.sidecarManager) return err(new Error("SidecarManager not available"));

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "KERNEL:LANDLOCK",
            message: `Deploying dynamic Landlock FS Gate for PID ${pid} on path ${path}`
        });

        const res = await this.sidecarManager.sendCommand("sentinel", {
            type: "ENFORCE_PID",
            pid,
            path
        });

        if (!res.success) {
            return err(new Error(`Landlock enforcement failed: ${res.stderr}`));
        }

        return ok(undefined);
    }

    /**
     * Deploys a global LSM policy to the eBPF agent.
     */
    async enforceLsmPolicy(policy: { blockedSyscalls: string[], restrictedPids: number[] }): Promise<Result<void>> {
        if (!this.sidecarManager) return err(new Error("SidecarManager not available"));
        
        const os = Deno.build.os;
        if (os !== "linux") {
             return ok(undefined);
        }

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
        const os = Deno.build.os;
        if (os !== "linux") {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:protection:kernel",
                message: `AppArmor deployment bypassed for non-Linux platform: ${os}`
            });
            return ok(undefined);
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "KERNEL:APPARMOR",
            message: `Generating hardened AppArmor profile for ${name}...`
        });

        const profileName = `cts-sidecar-${name}`;
        // SOV-P4: Detailed Sidecar capability mapping for AppArmor
        const capMap: Record<string, string[]> = {
            "sentinel": ["net_admin", "sys_admin", "sys_resource", "sys_ptrace", "ipc_lock"],
            "netcap": ["net_raw", "net_admin"],
            "enforcer": ["net_admin", "kill"],
            "watchfile": ["sys_admin"],
            "tunnel": ["net_admin"],
            "trustroot": ["sys_admin", "sys_rawio"],
            "analyzer": ["sys_admin", "sys_resource"],
            "decoy": ["net_bind_service"]
        };

        const caps = capMap[name] || ["net_admin", "sys_admin", "sys_resource"];
        const capStrings = caps.map(c => `  capability ${c},`).join("\n");

        const profile = `
# Hardened AppArmor Profile for Sovereign Sidecar: ${name}
# Generated by KernelService v1.0 (Strict Enforcement)

profile ${profileName} ${binaryPath} flags=(attach_disconnected) {
  #include <abstractions/base>
  #include <abstractions/nameservice>

  # System Permissions
${capStrings}

  # Deny all by default
  deny /etc/passwd w,
  deny /etc/shadow rw,
  deny /home/** rw,
  deny /root/** rw,
  deny /usr/bin/** mrx,
  deny /usr/sbin/** mrx,
  deny /bin/** mrx,
  deny /sbin/** mrx,

  # Allow strictly required access
  /proc/ r,
  /proc/*/ r,
  /proc/*/status r,
  /proc/*/comm r,
  /proc/*/cmdline r,
  /sys/ r,
  /sys/** r,
  /var/lib/cts/bin/${name} mr,
  /var/lib/cts/logs/** rw,
  /var/lib/cts/tmp/** rw,
  /volume/storage/agents/golden/${name} r,

  # Sidecar-specific exceptions
  ${name === "netcap" ? "/volume/storage/captures/** rw," : ""}
  ${name === "trustroot" ? "/dev/tpm* rw," : ""}

  # Network access
  network inet,
  network inet6,
  network raw,
  network unix,
}
`.trim();

        // SOV-06 HARDENING: Use secure root-owned directory for temporary files to prevent TOCTOU symlink attacks
        const secureTempDir = "/var/lib/cts/tmp";
        try {
            await this.executor.execute("mkdir", ["-p", secureTempDir]);
        } catch { /* ignore if already exists */ }

        let tempFile = "";
        try {
            const randomSuffix = crypto.randomUUID().slice(0, 8);
            tempFile = `${secureTempDir}/cts-profile-${name}-${randomSuffix}.profile`;

            await Deno.writeTextFile(tempFile, profile);
            await Deno.chmod(tempFile, 0o600);

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
        } finally {
            if (tempFile) {
                try { await Deno.remove(tempFile); } catch {}
            }
        }
    }

    /**
     * Triggers an atomic, Copy-On-Write (COW) snapshot of the forensic storage.
     * Utilizes cp --reflink to ensure zero-copy efficiency on supported filesystems (Btrfs, XFS, ZFS).
     */
    async snapshotForensics(): Promise<Result<void>> {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "KERNEL:FORENSICS",
            message: "Triggering atomic COW snapshot of forensic volume..."
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const source = "./volume/storage/forensics";
        const target = `./volume/storage/forensics_snapshot_${timestamp}`;

        // Ensure source exists
        try {
            await this.executor.execute("mkdir", ["-p", source]);
        } catch { /* ignore */ }

        // SOV-P5: Reflink-Aware Storage Management
        // Detect reflink support to choose the most efficient snapshot method.
        const hasReflink = await this.checkReflinkSupport();

        let res;
        let method = "copy";
        if (hasReflink) {
            res = await this.executor.execute("cp", ["-p", "--reflink=always", source, target]);
            method = "reflink";
        } else {
            // SOV-P5: Reflink-Aware Storage - Attempt Hard-link tree for efficient pseudo-COW
            // This is better than a full copy if the filesystem doesn't support reflink but we want speed/space efficiency.
            // Note: Modifications to original files will affect snapshots unless we ensure the app only appends.
            res = await this.executor.execute("cp", ["-al", source, target]);
            method = "hardlink";

            if (!res.success) {
                // Final fallback: Standard recursive copy
                res = await this.executor.execute("cp", ["-rp", source, target]);
                method = "copy";
            }
        }

        if (!res.success) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "KERNEL:FORENSICS",
                message: `Forensic snapshot failed: ${res.stderr}`
            });
            return err(new Error(res.stderr));
        }

        this.auditService.logEvent({
            type: LogType.ACTIVITY,
            severity: LogSeverity.SUCCESS,
            caller: "kernel:forensics",
            message: `Forensic snapshot created at ${target} (Method: ${method})`,
            data: { source, target, timestamp, method }
        });

        return ok(undefined);
    }

    private async checkReflinkSupport(): Promise<boolean> {
        if (Deno.build.os !== "linux") return false;

        // Quick probe: try to reflink a tiny file to /tmp
        try {
            const probeSource = "/etc/hostname";
            const probeTarget = "/tmp/cts_reflink_probe";
            const res = await this.executor.execute("cp", ["--reflink=always", probeSource, probeTarget]);
            if (res.success) {
                await Deno.remove(probeTarget).catch(() => {});
                return true;
            }
        } catch {
            // ignore
        }
        return false;
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
