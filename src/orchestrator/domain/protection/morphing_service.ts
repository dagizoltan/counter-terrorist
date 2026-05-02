import { HoneypotService } from "./honeypot_service.ts";
import { CanaryService } from "./canary_service.ts";
import { AuditService } from "../analysis/audit.ts";

/**
 * MorphingService
 * Periodically changes the system's defensive posture to confuse attackers.
 */
export class MorphingService {
    private intervalId?: number;

    constructor(
        private honeypot: HoneypotService,
        private canary: CanaryService,
        private audit: AuditService,
        private mesh: any // MeshManager
    ) {}

    /**
     * Starts the morphing engine.
     * @param intervalMs How often to rotate deception lures.
     */
    start(intervalMs: number = 600000) { 
        console.log(`[MORPHING] Deception Morphing Engine active. Interval: ${intervalMs}ms`);
        // Wrap execution in an error-handling block to prevent sidecar timeouts from crashing the orchestrator
        this.intervalId = setInterval(async () => {
            try {
                await this.executeMorph();
            } catch (e) {
                console.error("[MORPHING] Critical lifecycle error:", e instanceof Error ? e.message : String(e));
            }
        }, intervalMs);
    }

    /**
     * Triggers a manual rotation of all deception lures and system identities.
     */
    async executeMorph() {
        try {
            // Attempt to rotate honeypot ports and canary projection paths
            await this.honeypot.morph().catch(err => console.error(`[MORPHING] Honeypot morph failed: ${err.message}`));
            await this.canary.morph().catch(err => console.error(`[MORPHING] Canary morph failed: ${err.message}`));
            
            // Randomly rotate mesh identity to prevent long-term fingerprinting (10% chance per morph)
            if (Math.random() > 0.9) {
                await this.mesh.rotateIdentity().catch((err: Error) => console.error(`[MORPHING] Mesh rotation failed: ${err.message}`));
            }

            await this.audit.logEvent({
                type: "INFO",
                message: "DECEPTION MORPH COMPLETE: Mesh infrastructure has successfully changed its footprint."
            });
        } catch (e) {
            console.error("[MORPHING] Rotation failed:", e instanceof Error ? e.message : String(e));
        }
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    }
}
