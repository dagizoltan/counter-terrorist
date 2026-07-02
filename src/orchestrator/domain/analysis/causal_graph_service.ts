import { BaseService } from "@core/base_service.ts";
import { Result, ok, err } from "@core/result.ts";
import { LoggingPort, LogType, LogSeverity } from "@core/ports.ts";
import { ForensicSearchTool, ForensicRecord } from "../../tools/ops/forensic_query.ts";

export interface CausalNode {
    id: string;
    type: "PROCESS" | "NETWORK" | "FILE";
    label: string;
    timestamp: string;
    record: ForensicRecord;
    children: string[];
    parents: string[];
}

/**
 * CausalGraphService
 * Reconstructs attack timelines and causal relationships from forensic data.
 */
export class CausalGraphService extends BaseService {
    private searchTool: ForensicSearchTool;

    constructor(private logging: LoggingPort) {
        super();
        this.searchTool = new ForensicSearchTool();
    }

    protected override onInit(): Promise<Result<void>> {
        return Promise.resolve(ok(undefined));
    }

    /**
     * Reconstructs the causal graph starting from a root PID or search term.
     */
    async reconstructGraph(rootPid?: number, searchTerm?: string): Promise<Result<Map<string, CausalNode>>> {
        const nodes = new Map<string, CausalNode>();

        try {
            // Fetch relevant records
            // If rootPid is provided, we fetch everything and filter for broader context
            const searchRes = await this.searchTool.search({ searchTerm });
            if (!searchRes.success) return err(searchRes.error);
            let records = searchRes.data;

            if (rootPid) {
                const includedPids = new Set<number>([rootPid]);
                // Build a set of PIDs related to the root, including children
                // We sort by timestamp to ensure we see parents before children
                const sortedRecords = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
                for (const r of sortedRecords) {
                    if (r.ppid && includedPids.has(r.ppid)) {
                        includedPids.add(r.pid);
                    }
                }
                records = records.filter(r => includedPids.has(r.pid));
            }

            for (const record of records) {
                const id = this.getRecordId(record);
                if (!nodes.has(id)) {
                    nodes.set(id, {
                        id,
                        type: this.determineType(record),
                        label: `${record.comm} (${record.pid}) - ${record.syscall}`,
                        timestamp: record.timestamp,
                        record,
                        children: [],
                        parents: []
                    });
                }
            }

            const allNodes = Array.from(nodes.values());
            for (const node of allNodes) {
                for (const potentialChild of allNodes) {
                    if (node === potentialChild) continue;

                    if (this.isCausallyRelated(node, potentialChild)) {
                        node.children.push(potentialChild.id);
                        potentialChild.parents.push(node.id);
                    }
                }
            }

            return ok(nodes);
        } catch (e) {
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }

    private getRecordId(record: ForensicRecord): string {
        return `${record.pid}-${record.timestamp}-${record.syscall}`;
    }

    private determineType(record: ForensicRecord): "PROCESS" | "NETWORK" | "FILE" {
        if (record.syscall === "connect" || record.port) return "NETWORK";
        if (record.path || record.syscall === "openat") return "FILE";
        return "PROCESS";
    }

    private isCausallyRelated(parent: CausalNode, child: CausalNode): boolean {
        if (new Date(child.timestamp) < new Date(parent.timestamp)) return false;
        if (parent.record.pid === child.record.ppid) return true;
        if (parent.type === "PROCESS" && child.type === "NETWORK" && parent.record.pid === child.record.pid) {
            return true;
        }
        if (parent.type === "FILE" && child.type === "PROCESS" && parent.record.path === child.record.path) {
            return true;
        }

        return false;
    }
}
