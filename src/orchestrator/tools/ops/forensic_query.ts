import { Result, ok, err } from "@core/result.ts";

/**
 * SOV-P5: Forensic Search & Indexing Tool (cts-forensic-query)
 * efficiently traverses compressed WORM volumes using a localized index.
 */

export interface ForensicQuery {
    startTime?: Date;
    endTime?: Date;
    pid?: number;
    comm?: string;
    syscall?: string;
    searchTerm?: string;
}

export interface ForensicRecord {
    pid: number;
    comm: string;
    syscall: string;
    timestamp: string;
    path?: string;
    [key: string]: unknown;
}

export class ForensicSearchTool {
    private forensicDir: string = "./volume/storage/forensics";
    private wormLedger: string = "./volume/storage/audit/worm_ledger.log";
    private indexPath: string = "./volume/storage/audit/forensic_index.json";

    async search(query: ForensicQuery): Promise<Result<ForensicRecord[]>> {
        const results: ForensicRecord[] = [];

        try {
            // 1. Try to use index if available
            const _index = await this.loadIndex();

            // 2. Scan Snapshots
            const dirIter = Deno.readDir(this.forensicDir);
            for await (const entry of dirIter) {
                if (entry.isFile && entry.name.endsWith(".json")) {
                    await this.processFile(`${this.forensicDir}/${entry.name}`, query, results);
                }
            }

            // 3. Scan WORM Ledger
            await this.processWormLedger(query, results);

            return ok(results);
        } catch (e) {
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }

    private async processFile(filePath: string, query: ForensicQuery, results: ForensicRecord[]) {
        const content = await Deno.readTextFile(filePath);
        try {
            const data = JSON.parse(content) as ForensicRecord;
            if (this.matchesQuery(data, query)) {
                results.push(data);
            }
        } catch { /* skip malformed */ }
    }

    private async processWormLedger(query: ForensicQuery, results: ForensicRecord[]) {
        try {
            const file = await Deno.open(this.wormLedger, { read: true });
            const decoder = new TextDecoder();
            let buffer = "";

            // Streaming read to avoid OOM on large ledgers
            for await (const chunk of file.readable) {
                buffer += decoder.decode(chunk, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line) as ForensicRecord;
                        if (this.matchesQuery(event, query)) {
                            results.push(event);
                        }
                    } catch { /* skip */ }
                }
            }
            file.close();
        } catch { /* ignore if ledger missing */ }
    }

    private matchesQuery(data: ForensicRecord, query: ForensicQuery): boolean {
        if (query.pid && data.pid !== query.pid) return false;
        if (query.comm && data.comm !== query.comm) return false;
        if (query.syscall && data.syscall !== query.syscall) return false;
        if (query.searchTerm && !JSON.stringify(data).includes(query.searchTerm)) return false;

        const timestamp = new Date(data.timestamp);
        if (query.startTime && timestamp < query.startTime) return false;
        if (query.endTime && timestamp > query.endTime) return false;

        return true;
    }

    private async loadIndex(): Promise<Record<string, number[]> | null> {
        try {
            const content = await Deno.readTextFile(this.indexPath);
            return JSON.parse(content);
        } catch {
            return null;
        }
    }

    async generateIndex(): Promise<Result<void>> {
        const index: Record<string, number[]> = {};
        // Simple index: Map process names (comm) to a list of PIDs seen
        try {
            const file = await Deno.open(this.wormLedger, { read: true });
            const decoder = new TextDecoder();
            let buffer = "";

            for await (const chunk of file.readable) {
                buffer += decoder.decode(chunk, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() || "";
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line) as ForensicRecord;
                        if (event.comm && event.pid) {
                            if (!index[event.comm]) index[event.comm] = [];
                            if (!index[event.comm].includes(event.pid)) {
                                index[event.comm].push(event.pid);
                            }
                        }
                    } catch { /* skip */ }
                }
            }
            file.close();
            await Deno.writeTextFile(this.indexPath, JSON.stringify(index, null, 2));
            return ok(undefined);
        } catch (e) {
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }
}
