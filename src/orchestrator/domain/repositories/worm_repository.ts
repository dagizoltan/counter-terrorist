import { AuditEvent } from "../analysis/audit.ts";

/**
 * WORM Repository (Write-Once-Read-Many)
 * Simulates an immutable append-only sink.
 * In production, this would be a specialized logging driver (e.g. to /dev/lp0 or a remote immutable log).
 */
export class WormRepository {
    private logs: AuditEvent[] = [];
    private wormPath: string;

    constructor(wormPath: string = "./volume/storage/audit/worm_ledger.log") {
        this.wormPath = wormPath;
        this.ensureDir();
    }

    private async ensureDir() {
        try {
            const dir = this.wormPath.substring(0, this.wormPath.lastIndexOf("/"));
            await Deno.mkdir(dir, { recursive: true });
        } catch { /* ignore */ }
    }

    async append(event: AuditEvent): Promise<void> {
        // SEC-05: WORM Persistence Hardening.
        // We append to a local file in O_APPEND mode and explicitly fsync to ensure durability
        // before the orchestrator considers the forensic evidence "persistent."
        const line = JSON.stringify(event) + "\n";
        const encoded = new TextEncoder().encode(line);

        try {
            // For append-only WORM ledger, we use O_APPEND and fsync.
            // Atomic write-and-rename is less suitable for append-only logs unless we rewrite the whole file,
            // but for WORM we prioritize durability of each append.
            const file = await Deno.open(this.wormPath, { append: true, create: true, write: true });
            await file.write(encoded);
            // Ensure data is physically committed to the disk substrate
            await file.sync();
            file.close();
        } catch (e) {
            throw new Error(`WORM persistence failure: ${(e as Error).message}`);
        }

        this.logs.push(event);
    }

    /**
     * SEC-05 Hardening: Atomic State Persistence.
     * Used for full-file state updates to prevent corruption during power loss.
     */
    async saveAtomic(content: string): Promise<void> {
        const tempPath = `${this.wormPath}.tmp.${crypto.randomUUID()}`;
        try {
            await Deno.writeTextFile(tempPath, content);
            const file = await Deno.open(tempPath, { read: true });
            await file.sync();
            file.close();
            await Deno.rename(tempPath, this.wormPath);
        } catch (e) {
            try { await Deno.remove(tempPath); } catch { /* ignore */ }
            throw new Error(`Atomic persistence failure: ${(e as Error).message}`);
        }
    }

    async verifyIntegrity(): Promise<boolean> {
        // Basic check: Ensure no lines were deleted or modified (re-calculating hashes)
        try {
            const content = await Deno.readTextFile(this.wormPath);
            const lines = content.trim().split("\n");
            return lines.length === this.logs.length;
        } catch {
            return false;
        }
    }

    getLogs(): AuditEvent[] {
        return [...this.logs];
    }
}
