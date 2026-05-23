import { ok } from "@core/result.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshManager } from "../orchestration/mesh.ts";
import { AnonymizationService } from "./anonymization_service.ts";
import { BaseService } from "@core/base_service.ts";

/**
 * ShadowProtocolService
 * Orchestrates the "Shadow Mode" response when the system is under targeted attack.
 */
export class ShadowProtocolService extends BaseService {
    private shadowModeActive = false;

    constructor(
        private mesh: MeshManager,
        private anonymization: AnonymizationService,
        private logging: LoggingPort
    ) {
        super();
    }

    protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
        return { success: true, data: undefined };
    }

    protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
        return ok(undefined);
    }

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
            caller: "orchestrator:domain:protection:shadow_protocol",
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
            caller: "orchestrator:domain:protection:shadow_protocol",
            message: "Local telemetry silenced. Shifting to volatile mesh-gossip logging."
        });
        
        // 3. Mesh Camouflage: Increase Jitter and Padding
        await this.mesh.broadcast({ type: "SHADOW_MODE_ENGAGED", nodeId: this.mesh.getNodeId() });

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:protection:shadow_protocol",
            message: "Node successfully phased into shadow state."
        });
    }

    async deactivate() {
        this.shadowModeActive = false;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:protection:shadow_protocol",
            message: "Shadow Protocol deactivated. Returning to nominal stealth."
        });
    }

    isShadowModeActive(): boolean {
        return this.shadowModeActive;
    }
}
