import { LoggingPort, SyslogSeverity } from "../core/ports.ts";
import { MeshManager } from "./mesh.ts";

export interface AuditEvent {
    id: string;
    timestamp: string;
    type: string;
    message: string;
    data?: any;
    /** SHA-256 hash of this event's content (excluding prevHash and hash fields). */
    hash: string;
    /** Hash of the previous event, forming a tamper-evident chain. */
    prevHash: string;
}

/** Retention policy configuration for audit log. */
interface RetentionConfig {
    maxAgeDays: number;
    maxEvents: number;
}

export class AuditService {
    private lastHash: string = "GENESIS";
    private retentionConfig: RetentionConfig;
    private purgeIntervalId: number | undefined;
    private logQueue: Promise<void> = Promise.resolve();

    constructor(
        private kv: Deno.Kv, 
        private logging: LoggingPort,
        private mesh: MeshManager | null = null
    ) {
        this.retentionConfig = {
            maxAgeDays: Number(Deno.env.get("AUDIT_RETENTION_DAYS")) || 90,
            maxEvents: Number(Deno.env.get("AUDIT_MAX_EVENTS")) || 10000,
        };

        // Restore the last hash from the most recent event to continue the chain
        this.restoreChainHead();

        // Schedule periodic retention purge (every hour)
        this.purgeIntervalId = setInterval(() => this.purgeExpired(), 60 * 60 * 1000);

        // Schedule periodic mesh verification (every 5 minutes)
        setInterval(async () => {
          if (this.mesh) {
            const status = await this.getChainStatus();
            this.mesh.broadcastAuditVerification(status.lastHash, status.count);
          }
        }, 5 * 60 * 1000);
    }

    setMesh(mesh: MeshManager) {
        this.mesh = mesh;
    }
    
    private async restoreChainHead() {
        try {
            const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] }, { reverse: true, limit: 1 });
            for await (const entry of entries) {
                if (entry.value?.hash) {
                    this.lastHash = entry.value.hash;
                    this.logging.log(
                        `[AUDIT] Chain restored from last event: ${this.lastHash.slice(0, 12)}…`,
                        SyslogSeverity.INFORMATIONAL
                    );
                }
            }
        } catch (e) {
            this.logging.log(`[AUDIT] Failed to restore chain head: ${e}`, SyslogSeverity.WARNING);
        }
    }

    /**
     * Logs an audit event with hash chain integrity.
     * Uses a sequential queue to ensure the hash chain is strictly linear even with concurrent calls.
     */
    async logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string }) {
        this.logQueue = this.logQueue.then(async () => {
            const id = crypto.randomUUID();
            const timestamp = event.timestamp || new Date().toISOString();
            const prevHash = this.lastHash;

            // Compute hash over the event content + prevHash for chain integrity
            const hashInput = JSON.stringify({
                id,
                timestamp,
                type: event.type,
                message: event.message,
                data: event.data,
                prevHash,
            });
            const hash = await this.computeHash(hashInput);

            const auditEvent: AuditEvent = {
                ...event,
                id,
                timestamp,
                hash,
                prevHash,
            };

            try {
                await this.kv.set(["audit", Date.now(), id], auditEvent);
                this.lastHash = hash;
                
                // Forward audit event to remote syslog
                this.logging.log(`[AUDIT] ${auditEvent.type}: ${auditEvent.message}`, SyslogSeverity.NOTICE);

                // Gossip to mesh if critical
                if (this.mesh && (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT")) {
                  this.mesh.broadcastAuditEvent({
                    ...auditEvent,
                    node: Deno.hostname()
                  }).catch(console.error);
                }
            } catch (e) {
                console.error("[AUDIT] Failed to save event:", e);
            }
        });
        
        return this.logQueue;
    }

    async getChainStatus() {
        let count = 0;
        const entries = this.kv.list({ prefix: ["audit"] });
        for await (const _ of entries) {
            count++;
        }
        return { lastHash: this.lastHash, count };
    }

    async getRecentEvents(limit: number = 50): Promise<AuditEvent[]> {
        const events: AuditEvent[] = [];
        const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] }, { reverse: true, limit });

        for await (const entry of entries) {
            events.push(entry.value);
        }

        return events;
    }

    /**
     * Verifies the integrity of the audit log hash chain.
     * Returns verification result with details on any broken links.
     */
    async verifyChain(limit: number = 1000): Promise<{
        valid: boolean;
        eventsChecked: number;
        brokenAt?: { eventId: string; expected: string; actual: string };
    }> {
        // Get events in chronological order (oldest first)
        const events: AuditEvent[] = [];
        const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] }, { limit });

        for await (const entry of entries) {
            events.push(entry.value);
        }

        if (events.length === 0) {
            return { valid: true, eventsChecked: 0 };
        }

        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            // Recompute hash from event content
            const hashInput = JSON.stringify({
                id: event.id,
                timestamp: event.timestamp,
                type: event.type,
                message: event.message,
                data: event.data,
                prevHash: event.prevHash,
            });
            const expectedHash = await this.computeHash(hashInput);

            if (event.hash !== expectedHash) {
                return {
                    valid: false,
                    eventsChecked: i + 1,
                    brokenAt: {
                        eventId: event.id,
                        expected: expectedHash,
                        actual: event.hash,
                    },
                };
            }

            // Check chain link: event[i].prevHash should match event[i-1].hash
            if (i > 0 && event.prevHash !== events[i - 1].hash) {
                return {
                    valid: false,
                    eventsChecked: i + 1,
                    brokenAt: {
                        eventId: event.id,
                        expected: events[i - 1].hash,
                        actual: event.prevHash,
                    },
                };
            }
        }

        return { valid: true, eventsChecked: events.length };
    }

    /**
     * Purges expired audit events based on retention policy.
     * Removes events older than maxAgeDays and trims to maxEvents.
     */
    private async purgeExpired() {
        const cutoffTimestamp = Date.now() - (this.retentionConfig.maxAgeDays * 24 * 60 * 60 * 1000);
        let purgedCount = 0;

        try {
            const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] });
            for await (const entry of entries) {
                // Key format is ["audit", timestamp_ms, id]
                const eventTimestamp = entry.key[1] as number;
                if (eventTimestamp < cutoffTimestamp) {
                    await this.kv.delete(entry.key);
                    purgedCount++;
                }
            }

            // Also enforce max events limit
            const allEntries: Deno.KvEntry<AuditEvent>[] = [];
            const iter = this.kv.list<AuditEvent>({ prefix: ["audit"] });
            for await (const entry of iter) {
                allEntries.push(entry);
            }

            if (allEntries.length > this.retentionConfig.maxEvents) {
                // Remove oldest events beyond the limit
                const toRemove = allEntries.slice(0, allEntries.length - this.retentionConfig.maxEvents);
                for (const entry of toRemove) {
                    await this.kv.delete(entry.key);
                    purgedCount++;
                }
            }

            if (purgedCount > 0) {
                this.logging.log(
                    `[AUDIT] Retention purge: removed ${purgedCount} expired events.`,
                    SyslogSeverity.INFORMATIONAL
                );
            }
        } catch (e) {
            this.logging.log(`[AUDIT] Retention purge failed: ${e}`, SyslogSeverity.ERROR);
        }
    }

    /**
     * Computes SHA-256 hash of the input string, returned as hex.
     */
    private async computeHash(input: string): Promise<string> {
        const data = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
        const hashArray = new Uint8Array(hashBuffer);
        return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
    }
}
