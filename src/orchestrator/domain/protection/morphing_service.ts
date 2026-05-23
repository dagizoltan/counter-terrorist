import { HoneypotService } from "./honeypot_service.ts";
import { CanaryService } from "./canary_service.ts";
import { AuditService } from "../analysis/audit.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";

/**
 * MorphingService
 * Periodically changes the system's defensive posture to confuse attackers.
 */
export class MorphingService extends BaseService {
    private intervalId?: number;
    private logging: LoggingPort;

    constructor(
        private honeypot: HoneypotService,
        private canary: CanaryService,
        private audit: AuditService,
        private mesh: any // MeshManager
    ) {
        super();
        this.logging = audit.getLogging();
    }

    /**
     * Starts the morphing engine.
     * @param intervalMs How often to rotate deception lures.
     */
    start(intervalMs: number = 600000) { 
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:protection:morphing",
            message: `Deception Morphing Engine active. Interval: ${intervalMs}ms`
        });
        // Wrap execution in an error-handling block to prevent sidecar timeouts from crashing the orchestrator
        this.intervalId = setInterval(async () => {
            try {
                await this.executeMorph();
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:protection:morphing",
                    message: `Critical lifecycle error: ${e instanceof Error ? e.message : String(e)}`
                });
            }
        }, intervalMs);
    }

    /**
     * Triggers a manual rotation of all deception lures and system identities.
     */
    async executeMorph() {
        try {
            // Attempt to rotate honeypot ports and canary projection paths
            await this.honeypot.morph().catch(err => this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:morphing",
                message: `Honeypot morph failed: ${err.message}`
            }));
            await this.canary.morph().catch(err => this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:morphing",
                message: `Canary morph failed: ${err.message}`
            }));
            
            // Randomly rotate mesh identity to prevent long-term fingerprinting (10% chance per morph)
            if (Math.random() > 0.9) {
                await this.mesh.rotateIdentity().catch((err: Error) => this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:protection:morphing",
                    message: `Mesh rotation failed: ${err.message}`
                }));
            }

            await this.audit.logEvent({
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "decoy:system",
                message: "DECEPTION MORPH COMPLETE: Mesh infrastructure has successfully changed its footprint."
            });
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:protection:morphing",
                message: `Rotation failed: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }

    protected override async onInit(): Promise<Result<void>> {
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        return ok(undefined);
    }

    stop() {
        this.shutdown();
    }
}
