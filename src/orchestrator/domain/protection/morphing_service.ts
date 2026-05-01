import { HoneypotService } from "./honeypot_service.ts";
import { CanaryService } from "./canary_service.ts";
import { AuditService } from "../analysis/audit.ts";

export class MorphingService {
    private intervalId?: number;

    constructor(
        private honeypot: HoneypotService,
        private canary: CanaryService,
        private audit: AuditService,
        private mesh: any // MeshManager
    ) {}

    start(intervalMs: number = 600000) { // Default 10 minutes
        console.log(`[MORPHING] Deception Morphing Engine active. Interval: ${intervalMs}ms`);
        this.intervalId = setInterval(() => this.executeMorph(), intervalMs);
    }

    async executeMorph() {
        try {
            await this.honeypot.morph();
            await this.canary.morph();
            
            // Randomly rotate mesh identity to prevent long-term fingerprinting (10% chance per morph)
            if (Math.random() > 0.9) {
                await this.mesh.rotateIdentity();
            }

            await this.audit.logEvent({
                type: "INFO",
                message: "DECEPTION MORPH COMPLETE: Mesh infrastructure has successfully changed its footprint."
            });
        } catch (e) {
            console.error("[MORPHING] Rotation failed:", e);
        }
    }

    stop() {
        if (this.intervalId) clearInterval(this.intervalId);
    }
}
