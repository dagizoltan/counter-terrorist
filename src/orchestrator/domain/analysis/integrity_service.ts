import { MeshManager } from "../orchestration/mesh.ts";
import { AuditService } from "./audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { TPMManager } from "../../infrastructure/system/protection/tpm/tpm_manager.ts";

import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";

/**
 * IntegrityService
 * Implements the "Dead Man's Switch" - autonomous self-destruct for isolated, compromised nodes.
 */
export class IntegrityService extends BaseService {
    private checkIntervalId?: number;

    constructor(
        private mesh: MeshManager,
        private audit: AuditService,
        private tpm: TPMManager,
        private logging: LoggingPort
    ) {}

    override async init(): Promise<Result<void>> {
        if (this.initialized) return ok(undefined);
        this.start();
        this.initialized = true;
        return ok(undefined);
    }

    /**
     * Starts the integrity monitoring loop.
     */
    start() {
        if (this.checkIntervalId) return;
        this.checkIntervalId = setInterval(() => this.checkIntegrity(), 60000); // Once per minute
    }

    public override async shutdown(): Promise<Result<void>> {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = undefined;
        }
        this.initialized = false;
        return await super.shutdown();
    }

    private async checkIntegrity() {
        const isIsolated = this.mesh.getActiveNodeCount() === 0;

        // BUG-4.17 FIX: Make self-destruct less trigger-happy.
        // Increase threat window and threshold.
        const recentThreats = (await this.audit.getRecentEvents(50))
            .filter(e => e.type === "THREAT" || e.type === "CRITICAL");

        if (isIsolated && recentThreats.length >= 10) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "INTEGRITY",
                message: "IRRECOVERABLE COMPROMISE DETECTED. Node is isolated and under heavy attack. Initiating autonomous data shredding."
            });
            await this.initiateSelfDestruct();
        }
    }

    private async initiateSelfDestruct() {
        // ENHANCEMENT: Backup critical state to TPM or non-volatile storage before shredding if possible.
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "INTEGRITY",
            message: "DEAD MAN'S SWITCH TRIGGERED. Shredding mesh secrets..."
        });
        
        // 1. Shred local secrets
        // BUG-4.17 FIX: Move .env instead of deleting to allow manual recovery in non-production.
        if (Deno.env.get("ENVIRONMENT") === "production") {
            await Deno.remove("./.env").catch(() => {});
            await Deno.remove("./volume/pki", { recursive: true }).catch(() => {});
        } else {
            const backup = `./volume/pki_backup_${Date.now()}`;
            await Deno.rename("./volume/pki", backup).catch(() => {});
            await Deno.rename("./.env", `${backup}/.env`).catch(() => {});
        }

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
