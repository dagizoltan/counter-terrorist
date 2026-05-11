import { AuditService } from "../analysis/audit.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { resolve, dirname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";

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
    private agingIntervalId?: number;

    constructor(
        private auditService: AuditService, 
        private sidecar: SidecarManager,
        private logging: LoggingPort
    ) {
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

    private isProduction() {
        return Deno.env.get("ENVIRONMENT") === "production";
    }

    async registerToken(token: { id: string, path: string, desc: string }) {
        const newToken: CanaryToken = {
            id: token.id,
            projectionPath: token.path,
            masterPath: `${this.MASTER_DIR}/${token.id}_${Math.random().toString(36).substring(7)}`,
            description: token.desc,
            triggered: false
        };
        this.tokens.push(newToken);
        
        // Immediate deployment if initialized
        await this.deploySingle(newToken);
    }

    private async deploySingle(newToken: CanaryToken) {
        try {
            await Deno.mkdir(this.MASTER_DIR, { recursive: true }).catch(() => {});
            const content = `DECEPTION_TOKEN: ${newToken.description}\nSERIAL: ${Math.random().toString(36).substring(7)}\nDO NOT DELETE\n`;
            await Deno.writeTextFile(newToken.masterPath, content);

            const isProd = this.isProduction();
            if (!isProd) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.DEBUG,
                    severity: LogSeverity.INFO,
                    caller: "orchestrator:domain:protection:canary",
                    message: `[DEV MODE] Skipping projection: ${newToken.projectionPath}`
                });
                return;
            }

            const absProjection = resolve(newToken.projectionPath);
            await Deno.mkdir(dirname(absProjection), { recursive: true }).catch(() => {});
            
            try {
                await Deno.stat(newToken.projectionPath);
                return;
            } catch {}

            await Deno.link(newToken.masterPath, newToken.projectionPath);
            this.sidecar.sendCommand("fim", { type: "WatchPath", path: absProjection }).catch(() => {});
        } catch {}
    }

    /**
     * Deploys deception artifacts by creating master files and hardlinking them.
     */
    async start() {
        // Ensure master directory exists and is clean
        try {
            await Deno.remove(this.MASTER_DIR, { recursive: true });
        } catch { /* Directory might not exist */ }
        await Deno.mkdir(this.MASTER_DIR, { recursive: true }).catch(() => {});

        for (const token of this.tokens) {
            try {
                // 1. Generate Master Content
                const content = `DECEPTION_TOKEN: ${token.description}\nSERIAL: ${Math.random().toString(36).substring(7)}\nDO NOT DELETE\n`;
                await Deno.writeTextFile(token.masterPath, content);

                // 2. Project via Hardlink (Only in production)
                if (!this.isProduction()) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.DEBUG,
                        severity: LogSeverity.INFO,
                        caller: "orchestrator:domain:protection:canary",
                        message: `[DEV MODE] Master generated at ${token.masterPath}. Skipping root projection.`
                    });
                    continue; 
                }

                const absProjection = resolve(token.projectionPath);
                await Deno.mkdir(dirname(absProjection), { recursive: true }).catch(() => {});

                // Safety: Avoid overwriting legitimate files
                try {
                    await Deno.stat(token.projectionPath);
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.WARNING,
                        caller: "orchestrator:domain:protection:canary",
                        message: `Legitimate file at ${token.projectionPath}. Skipping projection.`
                    });
                    continue;
                } catch {
                    // Safe to link
                }

                // Create the hardlink (Atomic projection)
                await Deno.link(token.masterPath, token.projectionPath);
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.DEBUG,
                    severity: LogSeverity.INFO,
                    caller: "orchestrator:domain:protection:canary",
                    message: `Projected breadcrumb: ${token.projectionPath}`
                });

                // 3. Register with FIM
                this.sidecar.sendCommand("fim", { type: "WatchPath", path: absProjection }).catch(() => {});
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:domain:protection:canary",
                    message: `Projection failed for ${token.projectionPath}: ${(e as Error).message}`
                });
            }
        }
        
        this.startAging();
    }

    private lastInternalOp: Map<string, number> = new Map();

    /**
     * Periodically updates the 'Last Accessed' and 'Modified' timestamps of decoys.
     * This makes honey-tokens look like active system files.
     */
    private startAging() {
        if (this.agingIntervalId) clearInterval(this.agingIntervalId);
        this.agingIntervalId = setInterval(async () => {
            for (const token of this.tokens) {
                try {
                    // Record maintenance window to avoid self-triggering
                    this.lastInternalOp.set(resolve(token.projectionPath), Date.now());
                    
                    // Update 'atime' and 'mtime' to current time to simulate activity
                    await Deno.utime(token.projectionPath, new Date(), new Date());
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.DEBUG,
                        severity: LogSeverity.INFO,
                        caller: "orchestrator:domain:protection:canary",
                        message: `Lure aged (timestamp rotation): ${token.id}`
                    });
                } catch {
                    // Skip if file is locked or missing
                }
            }
        }, 3600000); // Once per hour
    }

    /**
     * Validates access against projected paths.
     */
    async handleFileAccess(accessedPath: string, process: string) {
        const normalizedAccessed = resolve(accessedPath);
        const now = Date.now();
        const lastOp = this.lastInternalOp.get(normalizedAccessed) || 0;

        // HIGH FIDELITY FILTERING:
        // Suppress only if the event occurs within 5s of an internal operation AND the actor is unknown (system:internal).
        // This prevents self-inflicted triggers while still capturing identified external processes.
        if (process === "system:internal" && (now - lastOp) < 5000) {
            return false; 
        }

        for (const token of this.tokens) {
            if (normalizedAccessed === resolve(token.projectionPath)) {
                token.triggered = true;
                this.auditService.logEvent({
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:protection:canary",
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
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "orchestrator:domain:protection:canary",
            message: "Rotating projections..."
        });
        for (const token of this.tokens) {
            try {
                const path = resolve(token.projectionPath);
                this.lastInternalOp.set(path, Date.now());

                // Remove projection and master
                await Deno.remove(token.projectionPath).catch(() => {});
                await Deno.remove(token.masterPath).catch(() => {});
                
                // Regenerate master path for entropy
                token.masterPath = `${this.MASTER_DIR}/${token.id}_${Math.random().toString(36).substring(7)}`;
                token.triggered = false;
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:domain:protection:canary",
                    message: `Cleanup failed: ${(e as Error).message}`
                });
            }
        }
        await this.start();
    }

    getTokens() {
        return this.tokens;
    }
}
