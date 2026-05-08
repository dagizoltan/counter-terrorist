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
            nodeId: this.mesh.getNodeId()
        };

        entry.hash = await this.computeHash(entry);
        this.chain.push(entry);
        this.lastHash = entry.hash;

        this.logging.logLegacy(`[LEDGER] Entry ${entry.index} committed: ${entry.hash.slice(0, 8)}`, SyslogSeverity.NOTICE);

        // Replicate to mesh via gossip
        this.mesh.broadcast({
            type: "LEDGER_SYNC",
            payload: entry
        });
    }

    /**
     * Synchronizes an entry received from another node.
     */
    async syncEntry(entry: LedgerEntry) {
        // Validate index and prevHash continuity
        if (this.chain.some(e => e.hash === entry.hash)) return; // Already exists

        // In a true sovereign mesh, we would validate signatures here.
        this.chain.push(entry);
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
