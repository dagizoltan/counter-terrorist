import { MeshNode } from "../mesh.ts";
import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";

export interface MeshConsensusDependencies {
    sendSync(node: MeshNode, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
    signPayload(payload: unknown): Promise<string>;
    verifySignature(payload: unknown, signature: string, peerId?: string): Promise<boolean>;
    getNodeId(): string;
    getKv?(): Deno.Kv | undefined;
}

export interface ConsensusSaga {
    action: string;
    approvals: string[];
    threshold: number;
    total: number;
    status: "PENDING" | "APPROVED" | "DENIED";
    createdAt: number;
}

export class MeshConsensusManager {
    constructor(
        private logging: LoggingPort,
        private config: ConfigurationPort,
        private mesh: MeshConsensusDependencies
    ) {}

    /**
     * Audit 4.3: Asynchronous Saga Pattern for Consensus.
     * Prevents event-loop blocking by using Deno KV and kv.watch for quorum tracking.
     */
    async requestQuorumCommand(action: string, data: unknown, nodes: MeshNode[]): Promise<boolean> {
        const now = Date.now();
        const verifiedNodes = nodes.filter(n => n.verified && (now - n.lastSeen) < 600000);
        const N = verifiedNodes.length + 1;
        const nodeId = this.mesh.getNodeId();

        if (this.config?.getEnv("SINGLE_NODE") === "true" || N === 1) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "MESH:QUORUM",
                message: `SINGLE_NODE mode: Auto-approving quorum for action: ${action}`
            });
            return true;
        }

        // Audit 7.4: Dynamic Quorum Thresholds.
        let threshold = Math.floor(N / 2) + 1;
        if (N === 2 && this.config.getBoolean("ALLOW_SMALL_QUORUM", true)) {
            threshold = 1;
        } else if (N >= 4) {
            threshold = Math.floor((2 * N) / 3) + 1;
        }

        const sagaId = crypto.randomUUID();
        const kv = this.mesh.getKv?.();

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "MESH:QUORUM",
            message: `Initiating Async Saga [${sagaId.slice(0,8)}] for ${action}. Threshold: ${threshold}/${N}`
        });

        if (kv && typeof kv.set === "function") {
            await kv.set(["consensus", sagaId], {
                action,
                approvals: [nodeId],
                threshold,
                total: N,
                status: "PENDING",
                createdAt: Date.now()
            });
        }

        const requestPayload = { action, data, sagaId, requester: nodeId, timestamp: Date.now() };
        const signature = await this.mesh.signPayload(requestPayload);

        let approvals = 1; // Self
        const peerPromises = verifiedNodes.map(async (node) => {
            try {
                const res = await this.mesh.sendSync(node, {
                    type: "CONSENSUS_REQUEST",
                    payload: requestPayload,
                    signature
                });

                if (res && res.approved && res.signature) {
                    const isValid = await this.mesh.verifySignature(res.payload, res.signature, node.id);
                    if (isValid) {
                        if (kv && typeof kv.atomic === "function") {
                            let attempts = 0;
                            while (attempts < 5) {
                                const entry = await kv.get<ConsensusSaga>(["consensus", sagaId]);
                                if (!entry.value || entry.value.status !== "PENDING") break;

                                const newApprovals = [...new Set([...entry.value.approvals, node.id])];
                                const status = newApprovals.length >= threshold ? "APPROVED" : "PENDING";

                                const result = await kv.atomic()
                                    .check(entry)
                                    .set(["consensus", sagaId], { ...entry.value, approvals: newApprovals, status })
                                    .commit();

                                if (result.ok) break;
                                attempts++;
                            }
                        } else {
                            // Fallback for non-KV/Mock environments
                            approvals++;
                        }
                    }
                }
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "MESH:QUORUM",
                    message: `Async vote delivery failed for node ${node.id}: ${e.message}`
                });
            }
        });

        if (!kv || typeof kv.watch !== "function") {
            await Promise.all(peerPromises);
            return approvals >= threshold;
        }

        return new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "MESH:QUORUM",
                    message: `Saga [${sagaId.slice(0,8)}] timed out after 15s.`
                });
                resolve(false);
            }, 15000);

            const watcher = kv.watch([["consensus", sagaId]]);
            (async () => {
                try {
                    for await (const [entry] of watcher) {
                        const saga = entry.value as ConsensusSaga | null;
                        if (saga?.status === "APPROVED") {
                            clearTimeout(timeout);
                            resolve(true);
                            break;
                        }
                        if (saga?.status === "DENIED") {
                            clearTimeout(timeout);
                            resolve(false);
                            break;
                        }
                    }
                } catch (e) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.ERROR,
                        caller: "MESH:QUORUM:WATCH",
                        message: `Consensus watcher failed: ${e.message}`
                    });
                    resolve(false);
                }
            })();
        });
    }
}
