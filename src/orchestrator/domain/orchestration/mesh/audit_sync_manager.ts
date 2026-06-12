import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshNode } from "../mesh.ts";
import { AuditService, AuditEvent } from "../../analysis/audit.ts";

export interface AuditSyncDeps {
    sendSyncInternal(node: MeshNode, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class MeshAuditSyncManager {
    constructor(
        private logging: LoggingPort,
        private audit: AuditService,
        private deps: AuditSyncDeps
    ) {}

    async reconcile(nodes: MeshNode[], selfId: string) {
        const verifiedNodes = nodes.filter(n => n.verified);
        for (const node of verifiedNodes) {
            try {
                const localStatus = await this.audit.getChainStatus();
                const res = await this.deps.sendSyncInternal(node, {
                    type: "MERKLE_CATCH_UP",
                    lastKnownHash: localStatus.lastHash,
                    nodeId: selfId
                });

                if (res && res.events && Array.isArray(res.events)) {
                    if (res.proof && typeof res.proof === "object") {
                        const { MerkleTree } = await import("../../../core/merkle.ts");
                        const proof = res.proof as { root: string; leaf: string; index: number; proof: string[] };
                        const isValid = await MerkleTree.verify(proof.root, proof.leaf, proof.index, proof.proof);
                        if (!isValid) throw new Error("Merkle proof verification failed");
                    }
                    await this.audit.syncEvents(res.events as AuditEvent[]);
                } else if (res && res.full_sync_required) {
                    const fullRes = await this.deps.sendSyncInternal(node, { type: "FETCH_STATE", nodeId: selfId });
                    if (fullRes && Array.isArray(fullRes.kv_snapshot)) {
                        await this.audit.syncEvents(fullRes.kv_snapshot as AuditEvent[]);
                    }
                }
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "mesh:audit-sync",
                    message: `Reconciliation failed with ${node.hostname}: ${(e as Error).message}`
                });
            }
        }
    }
}
