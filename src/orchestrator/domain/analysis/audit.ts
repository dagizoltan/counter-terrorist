import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshManager } from "../orchestration/mesh.ts";
import { withTelemetry } from "@core/service_utils.ts";
import { AuditRepository } from "../repositories/audit_repository.ts";

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
    severity?: string;
    caller?: string;
    message: string;
    actor?: ActorContext;
    data?: any;
    hash: string;
    prevHash: string;
    hwSignature?: string; 
    correlationId?: string;
    formatted?: string;
}

interface RetentionConfig {
    maxAgeDays: number;
    maxEvents: number;
}

/**
 * AuditService
 * Hardware-rooted immutable ledger logic.
 * Decoupled from persistence via AuditRepository.
 */
export class AuditService {
    private lastHash: string = "GENESIS";
    private lastVerifiedHash: string = "GENESIS";
    private retentionConfig: RetentionConfig;
    private logQueue: Promise<void> = Promise.resolve();

    constructor(
        private repo: AuditRepository,
        private logging: LoggingPort,
        private tpm: any | null = null,
        private mesh: MeshManager | null = null,
        private correlation: any | null = null
    ) {
        this.retentionConfig = {
            maxAgeDays: Number(Deno.env.get("AUDIT_RETENTION_DAYS")) || 90,
            maxEvents: Number(Deno.env.get("AUDIT_MAX_EVENTS")) || 10000,
        };

        this.restoreChainHead();
        
        // Background maintenance
        setInterval(() => this.purgeExpired(), 60 * 60 * 1000);
        setInterval(async () => {
          if (this.mesh) {
            const status = await this.getChainStatus();
            this.mesh.broadcastAuditVerification(status.lastHash, status.count);
          }
        }, 5 * 60 * 1000);

        setInterval(() => this.verifyChainIncremental(), 60 * 1000);
    }

    public setCorrelation(correlation: any) {
        this.correlation = correlation;
    }

    public getLogging(): LoggingPort {
        return this.logging;
    }

    public async getRecentEvents(limit: number = 100): Promise<AuditEvent[]> {
        return await this.repo.getLatest(limit);
    }

    private async restoreChainHead() {
        try {
            const latest = await this.repo.getLatest(1);
            if (latest.length > 0 && latest[0].hash) {
                this.lastHash = latest[0].hash;
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.INFO,
                    caller: "AUDIT",
                    message: `Chain head restored: ${this.lastHash.slice(0, 12)}…`
                });

                const verification = await this.verifyChain(100);
                if (!verification.valid) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "AUDIT",
                        message: `CHAIN INTEGRITY FAILURE. TAMPERING DETECTED.`
                    });
                } else {
                    this.lastVerifiedHash = this.lastHash;
                }
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "AUDIT",
                message: `Failed to restore chain head: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }

    async syncEvents(events: AuditEvent[]) {
        for (const event of events) {
            try {
                await this.repo.save(event);
            } catch (e) {
                // Ignore duplicates or errors during blind sync
            }
        }
        await this.restoreChainHead();
    }

    async logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string, correlationId?: string }) {
        this.logQueue = this.logQueue.then(async () => {
            const id = crypto.randomUUID();
            const timestamp = event.timestamp || new Date().toISOString();
            const prevHash = this.lastHash;

            const hashInput = {
                id, timestamp, type: event.type, severity: event.severity,
                caller: event.caller, message: event.message,
                actor: event.actor, data: event.data,
                correlationId: event.correlationId, prevHash,
            };
            const hash = await this.computeHash(hashInput);
            
            let hwSignature: string | undefined;
            if (this.tpm) {
                hwSignature = await this.tpm.sign(hash);
            }

            const formatted = `[${event.type.toUpperCase()}] [${(event.severity || "info").toLowerCase()}] [${(event.caller || "SYSTEM").toUpperCase()}] ${event.message}`;

            const auditEvent: AuditEvent = {
                ...event, id, timestamp, hash, prevHash, hwSignature, formatted
            };

            try {
                await this.repo.save(auditEvent);
                this.lastHash = hash;
                
                const severity = (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT") ? LogSeverity.WARNING : LogSeverity.INFO;
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity,
                    caller: "AUDIT",
                    message: `${auditEvent.type}: ${auditEvent.message} (Actor: ${auditEvent.actor?.id || "SYSTEM"})`,
                    payload: auditEvent.data
                });

                if (this.mesh && (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT")) {
                  this.mesh.broadcastAuditEvent({
                    ...auditEvent,
                    node: "orchestrator-node" // Simplified for Domain
                  }).catch(() => {});
                }

                if (this.correlation) {
                    this.correlation.processEvent(auditEvent).catch(() => {});
                }
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "AUDIT",
                    message: `Failed to save event: ${(e as Error).message}`
                });
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

    async verifyFullChain(): Promise<{
        valid: boolean;
        eventsChecked: number;
        brokenAt?: { eventId: string; expected: string; actual: string; type: string };
    }> {
        return await this.verifyChain(-1);
    }

    async verifyChain(limit: number = 1000): Promise<{
        valid: boolean;
        eventsChecked: number;
        brokenAt?: { eventId: string; expected: string; actual: string; type: string };
    }> {
        const events: AuditEvent[] = [];
        const fetchLimit = limit === -1 ? undefined : limit;
        const stream = this.repo.getStream(fetchLimit as any, true);

        for await (const event of stream) {
            events.push(event);
        }

        if (events.length === 0) return { valid: true, eventsChecked: 0 };
        events.reverse();

        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            // SECURITY: Hardware-Verified Checkpoint Bypass
            // If the event is a signed checkpoint, we verify the TPM signature instead of the content hash.
            // This allows the chain to remain valid after retention purges.
            if (event.type === "CHECKPOINT" && event.hwSignature && this.tpm) {
                const isValidCheckpoint = await this.tpm.verify(event.hash, event.hwSignature);
                if (!isValidCheckpoint) {
                    return {
                        valid: false,
                        eventsChecked: i + 1,
                        brokenAt: { eventId: event.id, expected: "VALID_TPM_SIG", actual: "INVALID_SIG", type: "CHECKPOINT_TAMPER" },
                    };
                }
                continue;
            }

            const hashInput = {
                id: event.id, timestamp: event.timestamp, type: event.type, severity: event.severity,
                caller: event.caller, message: event.message,
                actor: event.actor, data: event.data,
                correlationId: event.correlationId, prevHash: event.prevHash,
            };
            const expectedHash = await this.computeHash(hashInput);

            if (event.hash !== expectedHash) {
                return {
                    valid: false,
                    eventsChecked: i + 1,
                    brokenAt: { eventId: event.id, expected: expectedHash, actual: event.hash, type: "HASH_MISMATCH" },
                };
            }

            if (i > 0 && event.prevHash !== events[i - 1].hash && events[i].prevHash !== "TRUNCATED") {
                return {
                    valid: false,
                    eventsChecked: i + 1,
                    brokenAt: { eventId: event.id, expected: events[i - 1].hash, actual: event.prevHash, type: "CHAIN_BREAK" },
                };
            }
        }

        return { valid: true, eventsChecked: events.length };
    }

    private async purgeExpired() {
        const cutoffTimestamp = Date.now() - (this.retentionConfig.maxAgeDays * 24 * 60 * 60 * 1000);
        try {
            // 1. Identify the boundary event (the last one to be purged)
            const latest = await this.repo.getLatest(1000);
            const boundaryEvent = latest.find(e => new Date(e.timestamp).getTime() < cutoffTimestamp);

            if (boundaryEvent) {
                // 2. Create a hardware-signed Checkpoint to bridge the gap
                const checkpoint: AuditEvent = {
                    id: crypto.randomUUID(),
                    timestamp: new Date().toISOString(),
                    type: "CHECKPOINT",
                    severity: LogSeverity.INFO,
                    caller: "AUDIT:RETENTION",
                    message: `Chain Truncated. Genesis state summarized at ${boundaryEvent.timestamp}`,
                    hash: boundaryEvent.hash, // We adopt the hash E3 expects
                    prevHash: "TRUNCATED",
                    data: { purgedEventsCutoff: boundaryEvent.timestamp },
                    hwSignature: this.tpm ? await this.tpm.sign(boundaryEvent.hash) : undefined,
                    formatted: `[CHECKPOINT] [info] [AUDIT:RETENTION] Chain Truncated.`
                };
                
                await this.repo.save(checkpoint);
                
                // 3. Perform the actual purge
                await this.repo.deleteBefore(cutoffTimestamp);
                
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.INFO,
                    caller: "AUDIT",
                    message: `Audit ledger truncated. Checkpoint inserted at ${boundaryEvent.hash.slice(0, 12)}`
                });
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "AUDIT",
                message: `Retention purge failed: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }

    private canonicalStringify(obj: any): string {
      if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
      if (Array.isArray(obj)) return "[" + obj.map(item => this.canonicalStringify(item)).join(",") + "]";
      const keys = Object.keys(obj).sort();
      return "{" + keys.map(key => `${JSON.stringify(key)}:${this.canonicalStringify(obj[key])}`).join(",") + "}";
    }

    private async computeHash(input: any): Promise<string> {
        const str = this.canonicalStringify(input);
        const data = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
        const hashArray = new Uint8Array(hashBuffer);
        return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
    }
}
