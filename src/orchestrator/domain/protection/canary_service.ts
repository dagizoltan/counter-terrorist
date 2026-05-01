import { AuditService } from "../analysis/audit.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { resolve, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";

export interface CanaryToken {
    id: string;
    projectionPath: string; // The "realistic" path (e.g. ./.aws/config)
    masterPath: string;     // The "source of truth" in ./volume
    description: string;
    triggered: boolean;
}

/**
 * Canary Service: Manages active deception artifacts via Hardlink Projections.
 * Master files live in ./volume (ignored by Git) and are projected into 
 * the filesystem to look like real, high-value targets.
 */
export class CanaryService {
    private tokens: CanaryToken[] = [];
    private readonly MASTER_DIR = "./volume/deception/bait";

    constructor(private auditService: AuditService, private sidecar: SidecarManager) {
        const baitFiles = [
            { id: "fin_01", path: "./vault_credentials.xlsx", desc: "Fake financial credentials" },
            { id: "aws_01", path: "./.aws/config", desc: "Fake cloud infrastructure config" },
            { id: "ssh_01", path: "./.ssh/id_ed25519_production", desc: "Fake production SSH key" },
            { id: "k8s_01", path: "./.kube/config", desc: "Fake Kubernetes cluster config" },
            { id: "env_01", path: "./deployment_secrets.env", desc: "Fake CI/CD environment secrets" }
        ];

        this.tokens = baitFiles.map(b => ({
            id: b.id,
            projectionPath: b.path,
            masterPath: `${this.MASTER_DIR}/${b.id}_${Math.random().toString(36).substring(7)}`,
            description: b.desc,
            triggered: false
        }));
    }

    /**
     * Deploys deception artifacts by creating master files and hardlinking them.
     */
    async deploy() {
        // Ensure master directory exists
        await Deno.mkdir(this.MASTER_DIR, { recursive: true }).catch(() => {});

        for (const token of this.tokens) {
            try {
                // 1. Generate Master Content
                const content = `DECEPTION_TOKEN: ${token.description}\nSERIAL: ${Math.random().toString(36).substring(7)}\nDO NOT DELETE\n`;
                await Deno.writeTextFile(token.masterPath, content);

                // 2. Project via Hardlink (Only in production or if explicitly requested)
                const isDev = Deno.env.get("ENVIRONMENT") === "development";
                if (isDev) {
                    console.log(`[CANARY] [DEV MODE] Master generated at ${token.masterPath}. Skipping root projection.`);
                    continue; 
                }

                const absProjection = resolve(token.projectionPath);
                await Deno.mkdir(dirname(absProjection), { recursive: true }).catch(() => {});

                // Safety: Avoid overwriting legitimate files
                try {
                    await Deno.stat(token.projectionPath);
                    console.warn(`[CANARY] Legitimate file at ${token.projectionPath}. Skipping projection.`);
                    continue;
                } catch {
                    // Safe to link
                }

                // Create the hardlink (Atomic projection)
                await Deno.link(token.masterPath, token.projectionPath);
                console.log(`[CANARY] Projected breadcrumb: ${token.projectionPath} -> ${token.masterPath}`);

                // 3. Register with FIM
                this.sidecar.sendCommand("fim", { type: "WatchPath", payload: { path: absProjection } }).catch(() => {});
            } catch (e) {
                console.warn(`[CANARY] Projection failed for ${token.projectionPath}: ${(e as Error).message}`);
            }
        }
    }

    /**
     * Validates access against projected paths.
     */
    async handleFileAccess(accessedPath: string, process: string) {
        const normalizedAccessed = resolve(accessedPath);

        for (const token of this.tokens) {
            if (normalizedAccessed === resolve(token.projectionPath)) {
                token.triggered = true;
                this.auditService.logEvent({
                    type: "THREAT",
                    message: `CANARY TRIGGERED: ${process} accessed ${token.description}`,
                    data: { path: token.projectionPath, process, description: token.description }
                });
                return true;
            }
        }
        return false;
    }

    /**
     * Wipes all projections and master files, then re-deploys.
     */
    async morph() {
        console.log("[CANARY] Rotating projections...");
        for (const token of this.tokens) {
            try {
                // Remove projection and master
                await Deno.remove(token.projectionPath).catch(() => {});
                await Deno.remove(token.masterPath).catch(() => {});
                
                // Regenerate master path for entropy
                token.masterPath = `${this.MASTER_DIR}/${token.id}_${Math.random().toString(36).substring(7)}`;
                token.triggered = false;
            } catch (e) {
                console.warn(`[CANARY] Cleanup failed: ${(e as Error).message}`);
            }
        }
        await this.deploy();
    }

    getTokens() {
        return this.tokens;
    }
}
