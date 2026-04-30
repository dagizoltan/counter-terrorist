import { AuditService } from "./audit.ts";

export interface CanaryToken {
    path: string;
    description: string;
    triggered: boolean;
}

export class CanaryService {
    private tokens: CanaryToken[] = [];

    constructor(private auditService: AuditService) {
        this.tokens = [
            { path: "./vault_credentials.xlsx", description: "Fake financial credentials", triggered: false },
            { path: "./.aws/config", description: "Fake cloud infrastructure config", triggered: false },
            { path: "/tmp/sql_dump.sql", description: "Fake database backup", triggered: false }
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

    getTokens() {
        return this.tokens;
    }
}
