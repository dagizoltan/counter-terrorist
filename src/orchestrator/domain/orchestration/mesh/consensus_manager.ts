import { MeshNode } from "../mesh.ts";
import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "@core/ports.ts";
import { retry } from "../../../core/utils/resilience.ts";

export interface MeshConsensusDependencies {
    sendSync(node: MeshNode, payload: Record<string, unknown>): Promise<any>;
    signPayload(payload: unknown): Promise<string>;
    verifySignature(payload: unknown, signature: string, peerId?: string): Promise<boolean>;
    getNodeId(): string;
}

export class MeshConsensusManager {
    constructor(
        private logging: LoggingPort,
        private config: ConfigurationPort,
        private mesh: MeshConsensusDependencies
    ) {}

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

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "MESH:QUORUM",
            message: `Requesting mesh consensus (BFT model) for action: ${action}`
        });

        const threshold = N >= 4
            ? Math.floor((2 * N) / 3) + 1
            : Math.floor(N / 2) + 1;

        if (N < threshold) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "MESH:QUORUM",
                message: `Consensus impossible. Active nodes (${N}) < Threshold (${threshold}).`
            });
            return false;
        }

        let approvals = 1; // Self approval
        const requestPayload = { action, data, requester: nodeId, timestamp: Date.now() };

        for (const node of verifiedNodes) {
            try {
                const res = await this.mesh.sendSync(node, {
                    type: "CONSENSUS_REQUEST",
                    payload: requestPayload,
                    signature: await this.mesh.signPayload(requestPayload)
                }) as Record<string, unknown>;

                if (res && res.approved && res.signature) {
                    const isValid = await this.mesh.verifySignature(res.payload, res.signature as string, node.id);
                    if (isValid) {
                        approvals++;
                    } else {
                        this.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.AUDIT,
                            severity: LogSeverity.ERROR,
                            caller: "MESH:QUORUM",
                            message: `REJECTED traitorous signature from node ${node.id} for ${action}`
                        });
                    }
                }
            } catch (_e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "MESH:QUORUM",
                    message: `Node ${node.hostname} unreachable or denied.`
                });
            }

            if (approvals >= threshold) break;
        }

        const success = approvals >= threshold;
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: success ? LogSeverity.INFO : LogSeverity.WARNING,
            caller: "MESH:QUORUM",
            message: `Result for ${action}: ${success ? "APPROVED" : "DENIED"} (${approvals}/${threshold})`
        });
        return success;
    }
}
