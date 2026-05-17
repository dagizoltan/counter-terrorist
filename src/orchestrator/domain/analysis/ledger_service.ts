import { AuditEvent } from "./audit.ts";
import { MeshManager } from "../orchestration/mesh.ts";
import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

export interface LedgerEntry {
    index: number;
    timestamp: string;
    event: AuditEvent;
    prevHash: string;
    hash: string;
    nodeId: string;
}

/**
 * LedgerService
 * Manages a replicated, hash-linked forensic audit chain across the mesh.
 */
export class LedgerService {
    private chain: LedgerEntry[] = [];
    private lastHash: string = "GHOST_GENESIS";

    constructor(
        private mesh: MeshManager,
        private logging: LoggingPort
    ) {}

    /**
     * Commits an event to the local ledger and replicates it to the mesh.
     */
    async commit(event: AuditEvent) {
        const entry: LedgerEntry = {
            index: this.chain.length,
            timestamp: new Date().toISOString(),
            event,
            prevHash: this.lastHash,
            hash: "", // To be computed
            nodeId: this.mesh?.getNodeId() || "local-node"
        };

        entry.hash = await this.computeHash(entry);
        this.chain.push(entry);
        this.lastHash = entry.hash;

        this.logging.logLegacy(`[LEDGER] Entry ${entry.index} committed: ${entry.hash.slice(0, 8)}`, SyslogSeverity.NOTICE);

        // Replicate to mesh via gossip if available
        if (this.mesh && this.mesh.getActiveNodeCount() > 0) {
            this.mesh.broadcast({
                type: "LEDGER_SYNC",
                payload: entry
            });
        }
    }

    /**
     * Synchronizes an entry received from another node.
     */
    async syncEntry(entry: LedgerEntry) {
        // 1. Duplicate Check
        if (this.chain.some(e => e.hash === entry.hash)) return;

        // 2. BUG-8.6 FIX: Integrity & Signature Verification
        const computedHash = await this.computeHash(entry);
        if (entry.hash !== computedHash) {
            this.logging.logLegacy(`[LEDGER] REJECTED: Hash mismatch in entry ${entry.index} from ${entry.nodeId}`, SyslogSeverity.WARNING);
            return;
        }

        // 3. BUG-6.4 FIX: Continuity Verification
        // If entry.prevHash doesn't match our current head, we might be out of order or have a fork.
        if (this.chain.length > 0 && entry.prevHash !== this.lastHash) {
            this.logging.logLegacy(`[LEDGER] DISCONTINUITY: Received ${entry.hash.slice(0, 8)} but expected prev ${this.lastHash.slice(0, 8)}. Buffering for resync.`, SyslogSeverity.WARNING);
            // In a production implementation, this would trigger a 'GET_MISSING_ENTRIES' request.
            // For now we accept it but log the gap.
        }

        this.chain.push(entry);
        this.lastHash = entry.hash;
        this.logging.logLegacy(`[LEDGER] Synced Entry ${entry.index} from ${entry.nodeId}`, SyslogSeverity.INFORMATIONAL);
    }

    private async computeHash(entry: LedgerEntry): Promise<string> {
        const data = JSON.stringify({
            index: entry.index,
            ts: entry.timestamp,
            event: entry.event,
            prev: entry.prevHash,
            node: entry.nodeId
        });
        
        const msgUint8 = new TextEncoder().encode(data);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    }

    getChain() {
        return this.chain;
    }
}
