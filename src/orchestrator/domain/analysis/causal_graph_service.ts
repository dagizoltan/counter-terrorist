import { BaseService } from "@core/base_service.ts";
import { Result, ok, err } from "@core/result.ts";
import { LoggingPort } from "@core/ports.ts";
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
    async reconstructGraph(rootPid?: number, searchTerm?: string, maxNodes: number = 10000): Promise<Result<Map<string, CausalNode>>> {
        const nodes = new Map<string, CausalNode>();

        try {
            // Fetch relevant records
            // If rootPid is provided, we fetch everything and filter for broader context
            const searchRes = await this.searchTool.search({ searchTerm });
            if (!searchRes.success) return err(searchRes.error);
            let records = searchRes.data;

            // Enforce upper ceiling cap to prevent memory exhaustion
            if (records.length > maxNodes) {
                records = records.slice(0, maxNodes);
            }

            if (rootPid) {
                const includedPids = new Set<number>([rootPid]);
                // Build a set of PIDs related to the root, including children
                // We sort by timestamp to ensure we see parents before children
                const sortedRecords = [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
                for (const r of sortedRecords) {
                    if (typeof r.ppid === "number" && includedPids.has(r.ppid)) {
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
            // Performance optimization: Index potential child nodes by PPID and PID for O(1) candidate lookup
            const ppidIndex = new Map<number, CausalNode[]>();
            const pidIndex = new Map<number, CausalNode[]>();
            const pathIndex = new Map<string, CausalNode[]>();

            for (const n of allNodes) {
                if (typeof n.record.ppid === "number") {
                    let list = ppidIndex.get(n.record.ppid);
                    if (!list) { list = []; ppidIndex.set(n.record.ppid, list); }
                    list.push(n);
                }
                let pidList = pidIndex.get(n.record.pid);
                if (!pidList) { pidList = []; pidIndex.set(n.record.pid, pidList); }
                pidList.push(n);

                if (n.type === "PROCESS" && n.record.path) {
                    let pathList = pathIndex.get(n.record.path);
                    if (!pathList) { pathList = []; pathIndex.set(n.record.path, pathList); }
                    pathList.push(n);
                }
            }

            for (const node of allNodes) {
                const candidates = new Set<CausalNode>();
                // Parent PID matches child PPID
                const ppidMatches = ppidIndex.get(node.record.pid);
                if (ppidMatches) {
                    for (const childCandidate of ppidMatches) candidates.add(childCandidate);
                }
                // Process -> Network or File/Child event relation (same PID)
                if (node.type === "PROCESS") {
                    const pidMatches = pidIndex.get(node.record.pid);
                    if (pidMatches) {
                        for (const childCandidate of pidMatches) {
                            if (childCandidate.type !== "PROCESS") candidates.add(childCandidate);
                        }
                    }
                }
                // File -> Process relation (same path)
                if (node.type === "FILE" && node.record.path) {
                    const pathMatches = pathIndex.get(node.record.path);
                    if (pathMatches) {
                        for (const childCandidate of pathMatches) candidates.add(childCandidate);
                    }
                }

                for (const potentialChild of candidates) {
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
