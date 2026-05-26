import { MeshManager } from "../orchestration/mesh.ts";
import { MeshAuthPort } from "@core/ports.ts";
import { TPMManager } from "@infrastructure/system/protection/tpm/tpm_manager.ts";
import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok, err } from "@core/result.ts";

/**
 * SecretRotationService
 * Handles zero-downtime rotation of cryptographic secrets and identity tokens.
 */
export class SecretRotationService extends BaseService {
    constructor(
        private meshManager: MeshManager,
        private meshAuth: MeshAuthPort,
        private tpm: TPMManager,
        private config: ConfigurationPort,
        private logging: LoggingPort
    ) {
        super();
    }

    protected override async onInit(): Promise<Result<void>> {
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        return ok(undefined);
    }

    /**
     * Rotates a critical secret without disrupting active mesh communication.
     */
    async rotateSecret(type: "MESH_SECRET" | "API_TOKEN"): Promise<Result<void>> {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "IDENTITY:ROTATION",
            message: `Initiating zero-downtime rotation for ${type}...`
        });

        try {
            // 1. Generate new high-entropy secret
            const newSecret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");

            // 2. Seal in TPM (Hardware Anchor)
            if (this.tpm) {
                const pcrs = await this.tpm.getPcrs([0, 1, 7]);
                await this.tpm.sealSecret(type, newSecret, pcrs);
            }

            // 3. Stage the new secret in MeshAuth (allows it to be accepted as valid)
            if (type === "MESH_SECRET") {
                this.meshAuth.stageSecondarySecret(newSecret);
            }

            // 4. Update local configuration
            this.config.setEnv(type, newSecret);

            // 5. Broadcast rotation signal to the mesh
            if (type === "MESH_SECRET") {
                await this.meshManager.broadcast({
                    type: "SECRET_ROTATION_SIGNAL",
                    secretType: type,
                    timestamp: Date.now()
                }, true);
            }

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "IDENTITY:ROTATION",
                message: `Rotation complete for ${type}. Phasing out old secret...`
            });

            // 6. After a cooldown, commit the change (remove the old secret)
            setTimeout(() => {
                if (type === "MESH_SECRET") {
                    this.meshAuth.commitSecretSwap();
                }
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.INFO,
                    caller: "IDENTITY:ROTATION",
                    message: `Grace period expired. Old ${type} has been decommissioned.`
                });
            }, 60000); // 1 minute overlap

            return ok(undefined);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "IDENTITY:ROTATION",
                message: `Rotation FAILED for ${type}: ${error.message}`
            });
            return err(error);
        }
    }
}
