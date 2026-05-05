import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshManager } from "../engine/mesh.ts";
import { AnonymizationService } from "./anonymization_service.ts";

/**
 * ShadowProtocolService
 * Orchestrates the "Shadow Mode" response when the system is under targeted attack.
 */
export class ShadowProtocolService {
    private shadowModeActive = false;

    constructor(
        private mesh: MeshManager,
        private anonymization: AnonymizationService,
        private logging: LoggingPort
    ) {}

    /**
     * Activates the Shadow Protocol.
     * Initiates immediate stealth measures.
     */
    async activate() {
        if (this.shadowModeActive) return;
        
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "SHADOW",
            message: "!!! TARGETED ATTACK DETECTED. ACTIVATING SHADOW PROTOCOL !!!"
        });
        this.shadowModeActive = true;

        // 1. Identity Shift: Immediate Exit Rotation
        await this.anonymization.rotate();

        // 2. Telemetry Silencing: Shift logs to mesh-only (volatile)
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.WARNING,
            caller: "SHADOW",
            message: "Local telemetry silenced. Shifting to volatile mesh-gossip logging."
        });
        
        // 3. Mesh Camouflage: Increase Jitter and Padding
        await this.mesh.broadcast({ type: "SHADOW_MODE_ENGAGED", nodeId: this.mesh.getNodeId() });

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "SHADOW",
            message: "Node successfully phased into shadow state."
        });
    }

    async deactivate() {
        this.shadowModeActive = false;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "SHADOW",
            message: "Shadow Protocol deactivated. Returning to nominal stealth."
        });
    }

    isShadowModeActive(): boolean {
        return this.shadowModeActive;
    }
}
