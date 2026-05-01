import { AuditService } from "../analysis/audit.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { normalize, resolve } from "https://deno.land/std@0.224.0/path/mod.ts";

export interface CanaryToken {
    id: string;
    path: string;
    originalPath: string;
    description: string;
    triggered: boolean;
}

/**
 * Canary Service: Manages active deception artifacts (Honeyfiles).
 * These files are strategically placed to lure and detect intruders.
 */
export class CanaryService {
    private tokens: CanaryToken[] = [];

    constructor(private auditService: AuditService, private sidecar: SidecarManager) {
        this.tokens = [
            { id: "fin_01", path: "./vault_credentials.xlsx", originalPath: "./vault_credentials.xlsx", description: "Fake financial credentials", triggered: false },
            { id: "aws_01", path: "./.aws/config", originalPath: "./.aws/config", description: "Fake cloud infrastructure config", triggered: false },
            { id: "ssh_01", path: "./.ssh/id_ed25519_production", originalPath: "./.ssh/id_ed25519_production", description: "Fake production SSH key", triggered: false },
            { id: "k8s_01", path: "./.kube/config", originalPath: "./.kube/config", description: "Fake Kubernetes cluster config", triggered: false },
            { id: "env_01", path: "./deployment_secrets.env", originalPath: "./deployment_secrets.env", description: "Fake CI/CD environment secrets", triggered: false }
        ];
    }

    /**
     * Deploys all deception artifacts to their target locations.
     */
    async deploy() {
        for (const token of this.tokens) {
            try {
                // Ensure parent directory exists
                const absolutePath = resolve(token.path);
                const dir = absolutePath.substring(0, absolutePath.lastIndexOf("/"));
                await Deno.mkdir(dir, { recursive: true }).catch(() => {});

                // Safety: Don't overwrite legitimate files that aren't ours
                try {
                    const info = await Deno.stat(token.path);
                    if (info.isFile) {
                        const content = await Deno.readTextFile(token.path);
                        if (!content.includes("DECEPTION_TOKEN")) {
                            console.warn(`[CANARY] Legitimate file exists at ${token.path}. Skipping deployment to avoid data loss.`);
                            continue;
                        }
                    }
                } catch {
                    // File doesn't exist, proceed
                }

                const content = `DECEPTION_TOKEN: ${token.description}\nSERIAL: ${Math.random().toString(36).substring(7)}\nDO NOT DELETE\n`;
                await Deno.writeTextFile(token.path, content);
                console.log(`[CANARY] Deployed: ${token.path}`);

                // Register with FIM sidecar
                this.sidecar.sendCommand("fim", { type: "WatchPath", payload: { path: absolutePath } }).catch(() => {});
            } catch (e) {
                console.warn(`[CANARY] Deployment failed for ${token.path}: ${(e as Error).message}`);
            }
        }
    }

    /**
     * Validates if an accessed path matches an active canary.
     * Uses strict absolute path comparison to prevent false positives.
     */
    async handleFileAccess(accessedPath: string, process: string) {
        const normalizedAccessed = resolve(accessedPath);

        for (const token of this.tokens) {
            const tokenPath = resolve(token.path);
            if (normalizedAccessed === tokenPath) {
                token.triggered = true;
                this.auditService.logEvent({
                    type: "THREAT",
                    message: `CANARY TRIGGERED: ${process} accessed ${token.description}`,
                    data: { path: token.path, process, description: token.description }
                });
                return true;
            }
        }
        return false;
    }

    /**
     * Rotates bait files by moving them to new realistic locations 
     * and cleaning up old ones.
     */
    async morph() {
        console.log("[CANARY] Executing bait rotation...");
        for (const token of this.tokens) {
            try {
                const oldPath = token.path;
                const suffix = Math.random().toString(36).substring(7);
                
                // Construct a new "realistic" path name
                let newPath = token.originalPath;
                if (newPath.includes(".")) {
                    const parts = newPath.split(".");
                    const ext = parts.pop();
                    newPath = `${parts.join(".")}_${suffix}.${ext}`;
                } else {
                    newPath = `${newPath}_${suffix}`;
                }

                // Cleanup old bait
                await Deno.remove(oldPath).catch(() => {});
                
                token.path = newPath;
                token.triggered = false;
                
                await this.deploy();
            } catch (e) {
                console.warn(`[CANARY] Morphing failed for ${token.path}: ${(e as Error).message}`);
            }
        }
    }

    getTokens() {
        return this.tokens;
    }
}
