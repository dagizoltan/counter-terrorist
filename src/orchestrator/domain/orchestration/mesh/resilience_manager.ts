import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshNode } from "../mesh.ts";
import { AuditService } from "../../analysis/audit.ts";

export interface ResilienceDeps {
    sendSyncInternal(node: MeshNode, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
    requestAuditSync(nodeId: string): Promise<void>;
}

export class MeshResilienceManager {
    constructor(
        private logging: LoggingPort,
        private audit: AuditService,
        private deps: ResilienceDeps
    ) {}

    async resolveSplitBrain(nodes: MeshNode[], selfHash: string) {
        const verifiedNodes = nodes.filter(n => n.verified);
        if (verifiedNodes.length === 0) return;

        const roots = new Map<string, number>();
        for (const node of verifiedNodes) {
            try {
                const res = await this.deps.sendSyncInternal(node, { type: "GET_AUDIT_STATUS" });
                if (res && typeof res.lastHash === "string") {
                    roots.set(res.lastHash, (roots.get(res.lastHash) || 0) + 1);
                }
            } catch { /* ignore */ }
        }

        let majorityRoot = "";
        const N = verifiedNodes.length + 1;
        const threshold = N >= 4 ? Math.floor((2 * N) / 3) + 1 : Math.floor(N / 2) + 1;

        for (const [root, votes] of roots.entries()) {
            const totalVotes = votes + (root === selfHash ? 1 : 0);
            if (totalVotes >= threshold) {
                majorityRoot = root;
                break;
            }
        }

        if (majorityRoot && majorityRoot !== selfHash) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "mesh:resilience",
                message: `Split-brain detected! Majority root: ${majorityRoot.slice(0,8)}. Rollback sync required.`
            });

            for (const n of verifiedNodes) {
                try {
                    const res = await this.deps.sendSyncInternal(n, { type: "GET_AUDIT_STATUS" });
                    if (res && res.lastHash === majorityRoot) {
                        await this.deps.requestAuditSync(n.id);
                        break;
                    }
                } catch { /* ignore */ }
            }
        }
    }
}
