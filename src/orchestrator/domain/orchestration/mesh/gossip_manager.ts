import { MeshNode } from "../mesh.ts";
import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { Result, ok } from "@core/result.ts";
import { retry, CircuitBreaker } from "../../../core/utils/resilience.ts";
import { BloomFilter } from "../../../core/cache.ts";

export interface MeshGossipDependencies {
    sendSync(node: MeshNode, payload: Record<string, unknown>): Promise<any>;
}

export class MeshGossipManager {
    private gossipCache: BloomFilter = new BloomFilter(10000, 4);
    private circuitBreakers: Map<string, CircuitBreaker> = new Map();

    constructor(
        private logging: LoggingPort,
        private mesh: MeshGossipDependencies
    ) {}

    async broadcast(payload: Record<string, unknown>, nodes: MeshNode[], priority: boolean = false): Promise<Result<void>> {
        const payloadHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(payload)))
            .then(b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''));

        if (this.gossipCache.has(payloadHash)) return ok(undefined);
        this.gossipCache.add(payloadHash);

        // Audit 4.4: Gossip Hop Count / TTL to prevent broadcast storms.
        payload.hops = (payload.hops as number || 0) + 1;
        if ((payload as any).hops > 5) return ok(undefined);

        const verifiedNodes = nodes.filter(n => n.verified);
        const MAX_GOSSIP_CONCURRENCY = 16;
        const batches = [];
        for (let i = 0; i < verifiedNodes.length; i += MAX_GOSSIP_CONCURRENCY) {
            batches.push(verifiedNodes.slice(i, i + MAX_GOSSIP_CONCURRENCY));
        }

        for (const [batchIndex, batch] of batches.entries()) {
            const batchResults = await Promise.allSettled(batch.map(async (node, nodeIndex) => {
                if (!priority) {
                    const jitter = (batchIndex * MAX_GOSSIP_CONCURRENCY + nodeIndex) * 100;
                    await new Promise(r => setTimeout(r, jitter));
                }

                let breaker = this.circuitBreakers.get(node.id);
                if (!breaker) {
                    breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60000 });
                    this.circuitBreakers.set(node.id, breaker);
                }

                const gossipRes = await breaker.execute(() => retry(() => this.mesh.sendSync(node, payload), {
                    maxAttempts: priority ? 3 : 1,
                    baseDelayMs: 200
                }));

                if (!gossipRes.success) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.WARNING,
                        caller: "MESH:GOSSIP",
                        message: `Gossip failure to ${node.hostname}: ${gossipRes.error.message}`
                    });
                }
            }));

            for (const res of batchResults) {
                if (res.status === "rejected") {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.ERROR,
                        caller: "MESH:GOSSIP:BATCH",
                        message: `Unexpected error in gossip batch: ${res.reason}`
                    });
                }
            }
        }
        return ok(undefined);
    }
}
