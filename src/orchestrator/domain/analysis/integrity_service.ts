import { MeshManager } from "../engine/mesh.ts";
import { AuditService } from "./audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { TPMManager } from "../../infrastructure/system/protection/tpm/tpm_manager.ts";

/**
 * IntegrityService
 * Implements the "Dead Man's Switch" - autonomous self-destruct for isolated, compromised nodes.
 */
export class IntegrityService {
    private checkIntervalId?: number;

    constructor(
        private mesh: MeshManager,
        private audit: AuditService,
        private tpm: TPMManager,
        private logging: LoggingPort
    ) {}

    /**
     * Starts the integrity monitoring loop.
     */
    start() {
        this.checkIntervalId = setInterval(() => this.checkIntegrity(), 60000); // Once per minute
    }

    private async checkIntegrity() {
        const isIsolated = this.mesh.getActiveNodeCount() === 0;
        const recentThreats = (await this.audit.getRecentEvents(10)).filter(e => e.type === "THREAT" || e.type === "CRITICAL");

        if (isIsolated && recentThreats.length > 5) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "INTEGRITY",
                message: "IRRECOVERABLE COMPROMISE DETECTED. Node is isolated and under heavy attack."
            });
            await this.initiateSelfDestruct();
        }
    }

    private async initiateSelfDestruct() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "INTEGRITY",
            message: "DEAD MAN'S SWITCH TRIGGERED. Shredding mesh secrets..."
        });
        
        // 1. Shred local secrets
        // In a real system, this would overwrite the disk blocks where secrets live.
        await Deno.remove("./.env").catch(() => {});
        await Deno.remove("./volume/pki", { recursive: true }).catch(() => {});

        // 2. Clear TPM state
        // await this.tpm.clearSecrets();

        // 3. One final dying breath via covert channel (if possible)
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "INTEGRITY",
            message: "Sovereign Self-Destruct Sequence Complete. System Terminating."
        });
        
        Deno.exit(1);
    }
}
