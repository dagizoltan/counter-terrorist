import { AuditService } from "./audit.ts";
import { SidecarManager } from "../../infrastructure/sidecar_manager.ts";

export interface CanaryToken {
    path: string;
    description: string;
    triggered: boolean;
}

export class CanaryService {
    private tokens: CanaryToken[] = [];

    constructor(private auditService: AuditService, private sidecar: SidecarManager) {
        this.tokens = [
            { path: "./vault_credentials.xlsx", description: "Fake financial credentials", triggered: false },
            { path: "./.aws/config", description: "Fake cloud infrastructure config", triggered: false },
            { path: "/tmp/sql_dump.sql", description: "Fake database backup", triggered: false },
            { path: "/etc/ct-orchestrator/.master_key", description: "Fake orchestrator master key", triggered: false },
            { path: "./deployment_secrets.yaml", description: "Fake CI/CD secrets", triggered: false },
            { path: "/home/dagizoltan/.ssh/id_ed25519_production", description: "Fake production SSH key", triggered: false }
        ];
    }

    async deploy() {
        for (const token of this.tokens) {
            try {
                // Ensure directory exists if it's a hidden folder
                if (token.path.includes("/")) {
                    const dir = token.path.substring(0, token.path.lastIndexOf("/"));
                    if (dir && dir !== "." && dir !== "/tmp") {
                        await Deno.mkdir(dir, { recursive: true }).catch(() => {});
                    }
                }
                
                // Safety: Don't overwrite existing files
                try {
                  await Deno.stat(token.path);
                  console.warn(`[CANARY] Path ${token.path} already exists. Skipping.`);
                  continue;
                } catch {
                  // Proceed
                }

                await Deno.writeTextFile(token.path, `DECEPTION_TOKEN: ${token.description}\nSERIAL: ${Math.random().toString(36).substring(7)}\n`);
                console.log(`[CANARY] Deployed breadcrumb: ${token.path}`);

                // Tell FIM sidecar to watch this new file
                const fullPath = await Deno.realPath(token.path).catch(() => token.path);
                this.sidecar.sendCommand("fim", { type: "WATCH", path: fullPath }).catch(() => {});
            } catch (e) {
                console.warn(`[CANARY] Failed to deploy ${token.path}: ${e.message}`);
            }
        }
    }

    handleFileAccess(path: string, process: string) {
        const token = this.tokens.find(t => path.includes(t.path.replace("./", "")));
        if (token) {
            token.triggered = true;
            this.auditService.logEvent({
                type: "THREAT",
                message: `CANARY TRIGGERED: ${process} accessed ${token.path} (${token.description})`,
                data: { path: token.path, process }
            });
        }
    }

    /**
     * Rotates bait files to prevent attacker mapping.
     */
    async morph() {
        console.log("[CANARY] Rotating breadcrumbs...");
        for (const token of this.tokens) {
            try {
                const oldPath = token.path;
                // Add a random suffix for rotation
                const suffix = Math.random().toString(36).substring(7);
                const newPath = oldPath.includes(".") 
                    ? oldPath.replace(".", `_${suffix}.`) 
                    : `${oldPath}_${suffix}`;
                
                await Deno.rename(oldPath, newPath).catch(() => {});
                token.path = newPath;
                token.triggered = false;

                const fullPath = await Deno.realPath(newPath).catch(() => newPath);
                this.sidecar.sendCommand("fim", { type: "WATCH", path: fullPath }).catch(() => {});
            } catch (e) {
                console.warn(`[CANARY] Morph failed for ${token.path}: ${e.message}`);
            }
        }
    }

    getTokens() {
        return this.tokens;
    }
}
