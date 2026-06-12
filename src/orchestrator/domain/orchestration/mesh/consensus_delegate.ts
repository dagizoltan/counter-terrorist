import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshNode } from "../mesh.ts";

export interface ConsensusDeps {
    signPayload(payload: unknown): Promise<string>;
    verifySignature(payload: unknown, signature: string, peerId?: string): Promise<boolean>;
    sendSyncInternal(node: MeshNode, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class MeshConsensusDelegate {
    constructor(
        private logging: LoggingPort,
        private deps: ConsensusDeps
    ) {}

    async requestApproval(nodes: MeshNode[], selfId: string, action: string, data: unknown, threshold?: number): Promise<boolean> {
        const verifiedNodes = nodes.filter(n => n.verified);
        const totalNodes = verifiedNodes.length + 1;
        const targetThreshold = threshold ?? (Math.floor(totalNodes / 2) + 1);

        if (totalNodes < targetThreshold) return false;

        let approvals = 0;
        const requestPayload = { action, data, nodeId: selfId, timestamp: Date.now() };
        const signature = await this.deps.signPayload(requestPayload);

        for (const node of verifiedNodes) {
            try {
                const res = await this.deps.sendSyncInternal(node, {
                    type: "REQUEST_APPROVAL",
                    payload: requestPayload,
                    signature
                });
                if (res.approved) {
                    if (res.signature) {
                        const isValid = await this.deps.verifySignature(res.payload, res.signature as string, node.id);
                        if (isValid) approvals++;
                    } else {
                        approvals++;
                    }
                }
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "mesh:consensus",
                    message: `Node ${node.hostname} failed approval: ${(e as Error).message}`
                });
            }
        }

        return approvals >= targetThreshold;
    }
}
