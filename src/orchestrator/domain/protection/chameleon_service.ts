import { BaseService } from "@core/base_service.ts";
import { Result, ok, err } from "@core/result.ts";
import { LoggingPort, CommandPort, LogType, LogSeverity } from "@core/ports.ts";
import { HoneypotService } from "./honeypot_service.ts";

/**
 * Project Chameleon: Dynamic Deception & Redirection Service
 * Coordinates with sentinel to redirect unauthorized traffic to decoys.
 */
export class ChameleonService extends BaseService {
    private activeRedirections: Map<string, { targetIp: string, targetPort: number }> = new Map();

    constructor(
        private sidecarManager: CommandPort,
        private honeypot: HoneypotService,
        private logging: LoggingPort
    ) {
        super();
    }

    protected override onInit(): Promise<Result<void>> {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "CHAMELEON",
            message: "Project Chameleon active. Monitoring for deception redirection opportunities..."
        });
        return Promise.resolve(ok(undefined));
    }

    /**
     * Redirects a specific destination (IP:Port) to a high-fidelity decoy.
     */
    async redirectToDecoy(destIp: string, destPort: number, decoyModuleId: string): Promise<Result<void>> {
        const module = this.honeypot.getModule(decoyModuleId);
        if (!module) return err(new Error(`Decoy module ${decoyModuleId} not found`));

        const localIp = "127.0.0.1";
        const decoyPort = module.port;

        const res = await this.sidecarManager.sendCommand("sentinel", {
            type: "ADD_REDIRECTION",
            ip: destIp,
            port: destPort,
            new_ip: localIp,
            new_port: decoyPort
        });

        if (res.success) {
            this.activeRedirections.set(`${destIp}:${destPort}`, { targetIp: localIp, targetPort: decoyPort });
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "CHAMELEON",
                message: `Project Chameleon: Redirected unauthorized access to ${destIp}:${destPort} to ${module.name} (Port ${decoyPort})`
            });
            return ok(undefined);
        }

        return err(new Error(`Failed to apply redirection: ${res.stderr}`));
    }

    async removeRedirection(destIp: string, destPort: number): Promise<Result<void>> {
        const res = await this.sidecarManager.sendCommand("sentinel", {
            type: "REMOVE_REDIRECTION",
            ip: destIp,
            port: destPort
        });

        if (res.success) {
            this.activeRedirections.delete(`${destIp}:${destPort}`);
            return ok(undefined);
        }
        return err(new Error(`Failed to remove redirection: ${res.stderr}`));
    }

    getActiveRedirections() {
        return Array.from(this.activeRedirections.entries());
    }
}
