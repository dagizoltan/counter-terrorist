import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { MeshManager } from "../engine/mesh.ts";
import { TimelineRepository } from "@infrastructure/persistence/repositories/timeline_repository.ts";
import { withTelemetry } from "@core/service_utils.ts";

export interface ActorContext {
    id: string;
    role: string;
    ip: string;
    userAgent?: string;
}

export interface AuditEvent {
    id: string;
    timestamp: string;
    type: string;
    message: string;
    actor?: ActorContext; // Traceability: Who performed the action
    data?: any;
    hash: string;
    prevHash: string;
    hwSignature?: string; 
}

interface RetentionConfig {
    maxAgeDays: number;
    maxEvents: number;
}

/**
 * AuditService
 * Hardware-rooted immutable ledger for security and compliance.
 */
export class AuditService {
    private lastHash: string = "GENESIS";
    private lastVerifiedHash: string = "GENESIS";
    private retentionConfig: RetentionConfig;
    private purgeIntervalId: number | undefined;
    private logQueue: Promise<void> = Promise.resolve();
    private repo: TimelineRepository<AuditEvent>;

    constructor(
        private kv: Deno.Kv, 
        private logging: LoggingPort,
        private tpm: any | null = null,
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

        setInterval(() => this.verifyChainIncremental(), 60 * 1000);

        this.logEvent = withTelemetry("Audit:Log", this.logEvent.bind(this), logging) as any;
        this.verifyChain = withTelemetry("Audit:Verify", this.verifyChain.bind(this), logging) as any;
    }

    public getLogging(): LoggingPort {
        return this.logging;
    }

    /**
     * Retrieves recent audit events. Required by Metrics and Compliance services.
     */
    public async getRecentEvents(limit: number = 100): Promise<AuditEvent[]> {
        return await this.repo.getLatest(limit);
    }

    private async restoreChainHead() {
        try {
            const latest = await this.repo.getLatest(1);
            if (latest.length > 0 && latest[0].hash) {
                this.lastHash = latest[0].hash;
                this.logging.log(
                    `[AUDIT] Chain head restored: ${this.lastHash.slice(0, 12)}…`,
                    SyslogSeverity.INFORMATIONAL
                );

                const verification = await this.verifyChain(100);
                if (!verification.valid) {
                    this.logging.log(
                        `[AUDIT] [CRITICAL] CHAIN INTEGRITY FAILURE. TAMPERING DETECTED AT EVENT ${verification.brokenAt?.eventId || "UNKNOWN"}`,
                        SyslogSeverity.EMERGENCY
                    );
                } else {
                    this.lastVerifiedHash = this.lastHash;
                    this.logging.log(`[AUDIT] Verified integrity of recent history (${verification.eventsChecked} events).`, SyslogSeverity.DEBUG);
                }
            }
        } catch (e) {
            this.logging.log(`[AUDIT] Failed to restore chain head: ${e instanceof Error ? e.message : String(e)}`, SyslogSeverity.WARNING);
        }
    }

    /**
     * Records a cryptographically signed event in the audit trail.
     */
    async logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string }) {
        this.logQueue = this.logQueue.then(async () => {
            const id = crypto.randomUUID();
            const timestamp = event.timestamp || new Date().toISOString();
            const prevHash = this.lastHash;

            const hashInput = JSON.stringify({
                id,
                timestamp,
                type: event.type,
                message: event.message,
                actor: event.actor,
                data: event.data,
                prevHash,
            });
            const hash = await this.computeHash(hashInput);
            
            let hwSignature: string | undefined;
            if (this.tpm) {
                hwSignature = await this.tpm.sign(hash);
            }

            const auditEvent: AuditEvent = {
                ...event,
                id,
                timestamp,
                hash,
                prevHash,
                hwSignature,
            };

            try {
                await this.repo.set(id, auditEvent);
                this.lastHash = hash;
                
                const severity = (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT") ? SyslogSeverity.NOTICE : SyslogSeverity.DEBUG;
                this.logging.log(`[AUDIT] ${auditEvent.type}: ${auditEvent.message} (Actor: ${auditEvent.actor?.id || "SYSTEM"})`, severity);

                if (this.mesh && (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT")) {
                  this.mesh.broadcastAuditEvent({
                    ...auditEvent,
                    node: Deno.hostname()
                  }).catch(() => {});
                }
            } catch (e) {
                console.error("[AUDIT] Failed to save event:", e);
            }
        });
        
        return this.logQueue;
    }

    async getChainStatus() {
        const count = await this.repo.count();
        return { lastHash: this.lastHash, count, lastVerifiedHash: this.lastVerifiedHash };
    }

    async verifyChainIncremental() {
        if (this.lastHash === this.lastVerifiedHash) return;
        const res = await this.verifyChain(100);
        if (res.valid) {
            this.lastVerifiedHash = this.lastHash;
        }
    }

    async verifyChain(limit: number = 1000): Promise<{
        valid: boolean;
        eventsChecked: number;
        brokenAt?: { eventId: string; expected: string; actual: string; type: string };
    }> {
        const events: AuditEvent[] = [];
        const entries = this.kv.list<AuditEvent>({ prefix: ["audit"] }, { limit, reverse: true });

        for await (const entry of entries) {
            events.push(entry.value);
        }

        if (events.length === 0) return { valid: true, eventsChecked: 0 };

        events.reverse();

        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            const hashInput = JSON.stringify({
                id: event.id,
                timestamp: event.timestamp,
                type: event.type,
                message: event.message,
                actor: event.actor,
                data: event.data,
                prevHash: event.prevHash,
            });
            const expectedHash = await this.computeHash(hashInput);

            if (event.hash !== expectedHash) {
                return {
                    valid: false,
                    eventsChecked: i + 1,
                    brokenAt: { eventId: event.id, expected: expectedHash, actual: event.hash, type: "HASH_MISMATCH" },
                };
            }

            if (this.tpm && event.hwSignature) {
                const isSigValid = await this.tpm.verify(event.hash, event.hwSignature);
                if (!isSigValid) {
                    return {
                        valid: false,
                        eventsChecked: i + 1,
                        brokenAt: { eventId: event.id, expected: "VALID_HW_SIG", actual: "INVALID_HW_SIG", type: "HW_SIG_FAILURE" },
                    };
                }
            }

            if (i > 0) {
                const prevEvent = events[i - 1];
                if (event.prevHash !== prevEvent.hash) {
                    return {
                        valid: false,
                        eventsChecked: i + 1,
                        brokenAt: { eventId: event.id, expected: prevEvent.hash, actual: event.prevHash, type: "CHAIN_BREAK" },
                    };
                }
            }
        }

        return { valid: true, eventsChecked: events.length };
    }

    private async purgeExpired() {
        const cutoffTimestamp = Date.now() - (this.retentionConfig.maxAgeDays * 24 * 60 * 60 * 1000);
        try {
            const purgedCount = await this.repo.deleteBefore(cutoffTimestamp);
            if (purgedCount > 0) {
                this.logging.log(`[AUDIT] Retention purge: removed ${purgedCount} expired events.`, SyslogSeverity.INFORMATIONAL);
            }
        } catch (e) {
            this.logging.log(`[AUDIT] Retention purge failed: ${e instanceof Error ? e.message : String(e)}`, SyslogSeverity.ERROR);
        }
    }

    private async computeHash(input: string): Promise<string> {
        const data = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
        const hashArray = new Uint8Array(hashBuffer);
        return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
    }
}
