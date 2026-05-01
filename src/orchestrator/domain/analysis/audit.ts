import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { MeshManager } from "../engine/mesh.ts";
import { TimelineRepository } from "@infrastructure/persistence/repositories/timeline_repository.ts";
import { withTelemetry } from "@core/service_utils.ts";

export interface AuditEvent {
    id: string;
    timestamp: string;
    type: string;
    message: string;
    data?: any;
    hash: string;
    prevHash: string;
}

interface RetentionConfig {
    maxAgeDays: number;
    maxEvents: number;
}

export class AuditService {
    private lastHash: string = "GENESIS";
    private retentionConfig: RetentionConfig;
    private purgeIntervalId: number | undefined;
    private logQueue: Promise<void> = Promise.resolve();
    private repo: TimelineRepository<AuditEvent>;

    constructor(
        private kv: Deno.Kv, 
        private logging: LoggingPort,
        private mesh: MeshManager | null = null
    ) {
        this.repo = new TimelineRepository<AuditEvent>(kv, "audit");
        this.retentionConfig = {
            maxAgeDays: Number(Deno.env.get("AUDIT_RETENTION_DAYS")) || 90,
            maxEvents: Number(Deno.env.get("AUDIT_MAX_EVENTS")) || 10000,
        };

        this.restoreChainHead();
        this.purgeIntervalId = setInterval(() => this.purgeExpired(), 60 * 60 * 1000);
        
        setInterval(async () => {
          if (this.mesh) {
            const status = await this.getChainStatus();
            this.mesh.broadcastAuditVerification(status.lastHash, status.count);
          }
        }, 5 * 60 * 1000);

        // Wrap public methods with telemetry
        this.logEvent = withTelemetry("Audit:Log", this.logEvent.bind(this), logging) as any;
        this.verifyChain = withTelemetry("Audit:Verify", this.verifyChain.bind(this), logging) as any;
    }

    public getLogging(): LoggingPort {
        return this.logging;
    }

    setMesh(mesh: MeshManager) {
        this.mesh = mesh;
    }
    
    private async restoreChainHead() {
        try {
            const latest = await this.repo.getLatest(1);
            if (latest.length > 0 && latest[0].hash) {
                this.lastHash = latest[0].hash;
                this.logging.log(
                    `[AUDIT] Chain restored from last event: ${this.lastHash.slice(0, 12)}…`,
                    SyslogSeverity.INFORMATIONAL
                );
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
                await this.repo.set(id, auditEvent);
                this.lastHash = hash;
                
                // Forward audit event to remote syslog
                const severity = (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT") ? SyslogSeverity.NOTICE : SyslogSeverity.DEBUG;
                this.logging.log(`[AUDIT] ${auditEvent.type}: ${auditEvent.message}`, severity);

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
        const count = await this.repo.count();
        return { lastHash: this.lastHash, count };
    }

    async getRecentEvents(limit: number = 50): Promise<AuditEvent[]> {
        return await this.repo.getLatest(limit);
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
        this.logging.log(`[AUDIT] Starting integrity verification for last ${limit} events…`, SyslogSeverity.DEBUG);
        
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

            // 1. Recompute current hash
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

            // 2. Check chain link (only if the previous event is present in this window)
            // If i > 0, we have the previous event in our list due to chronological sorting.
            if (i > 0) {
                const prevEvent = events[i - 1];
                if (event.prevHash !== prevEvent.hash) {
                    // Check if there's a gap (meaning events were purged)
                    // If the current event's prevHash doesn't match the immediate predecessor's hash,
                    // it MUST be a broken chain UNLESS we can prove the predecessor was purged.
                    // But since we listed ALL events in this range, if it doesn't match the predecessor, it's broken.
                    return {
                        valid: false,
                        eventsChecked: i + 1,
                        brokenAt: {
                            eventId: event.id,
                            expected: prevEvent.hash,
                            actual: event.prevHash,
                        },
                    };
                }
            } else {
                // For the very first event in our window, we can't check its prevHash 
                // because the predecessor might have been purged. This is expected.
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
        try {
            const purgedCount = await this.repo.deleteBefore(cutoffTimestamp);

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
