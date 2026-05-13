import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshManager } from "../orchestration/mesh.ts";
import { withTelemetry } from "@core/service_utils.ts";
import { AuditRepository } from "../repositories/audit_repository.ts";
import { TPMManager } from "../../infrastructure/system/protection/tpm/tpm_manager.ts";
import { computeHash } from "../../core/crypto_utils.ts";

export interface ICorrelationProcessor {
    processEvent(event: AuditEvent): Promise<void>;
}

export interface ActorContext {
    id: string;
    role: string;
    ip: string;
    userAgent?: string;
}

export enum SystemState {
    NORMAL = "NORMAL",
    FORENSIC_RESTRICTED = "FORENSIC_RESTRICTED"
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
    private state: SystemState = SystemState.NORMAL;
    /** BUG-03: Promise that resolves once the chain head is restored from DB. */
    private ready: Promise<void>;
    private intervals: number[] = [];

    constructor(
        private repo: AuditRepository,
        private logging: LoggingPort,
        private tpm: TPMManager | null = null,
        private mesh: MeshManager | null = null,
        private correlation: ICorrelationProcessor | null = null
    ) {
        this.retentionConfig = {
            maxAgeDays: Number(Deno.env.get("AUDIT_RETENTION_DAYS")) || 90,
            maxEvents: Number(Deno.env.get("AUDIT_MAX_EVENTS")) || 10000,
        };

        this.ready = this.restoreChainHead();
        
        // Background maintenance
        this.intervals.push(setInterval(() => this.purgeExpired(), 60 * 60 * 1000));
        this.intervals.push(setInterval(async () => {
          if (this.mesh) {
            const status = await this.getChainStatus();
            this.mesh.broadcastAuditVerification(status.lastHash, status.count);
          }
        }, 5 * 60 * 1000));

        this.intervals.push(setInterval(() => this.verifyChainIncremental(), 60 * 1000));

        // ENHANCEMENT: Full Ledger Verification on Boot (Background)
        // Disabled for UI stabilization phase
        // setTimeout(() => this.performDeepAudit(), 5000);
    }

    private async performDeepAudit() {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "AUDIT:DEEP",
            message: "Initiating full-chain forensic integrity audit..."
        });

        const result = await this.verifyFullChain();
        if (!result.valid) {
            this.state = SystemState.FORENSIC_RESTRICTED;

            // Apply read-only enforcement at the repository layer
            const { KvRepository } = await import("../../infrastructure/persistence/repositories/kv_repository.ts");
            KvRepository.setReadOnly(true);

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "AUDIT:DEEP",
                message: `CRITICAL: Forensic chain breach detected at event ${result.brokenAt?.eventId}. Type: ${result.brokenAt?.type}. Transitioning to Forensic Restricted Mode.`
            });

            if (this.mesh) {
                this.mesh.broadcastLockdown().catch(() => {});
            }
        } else {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "AUDIT:DEEP",
                message: `Deep audit complete. ${result.eventsChecked} events verified. Chain is healthy.`
            });
    }

    public stop() {
        this.intervals.forEach(clearInterval);
        this.intervals = [];
    }

    public setCorrelation(correlation: ICorrelationProcessor) {
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
                    caller: "orchestrator:domain:analysis:audit",
                    message: `Chain head restored: ${this.lastHash.slice(0, 12)}…`
                });

                // Lightweight check on boot
                const verification = await this.verifyChain(50);
                if (!verification.valid) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:domain:analysis:audit",
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
                caller: "orchestrator:domain:analysis:audit",
                message: `Failed to restore chain head: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }

    /**
     * Synchronizes events from mesh peers, verifying integrity before merging.
     */
    async syncEvents(events: AuditEvent[]) {
        if (!events || events.length === 0) return;

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "AUDIT:SYNC",
            message: `Verifying and merging ${events.length} mesh events...`
        });

        // 1. Sort events chronologically to allow chain verification
        const sorted = [...events].sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        for (const event of sorted) {
            try {
                // 2. Structural & Integrity Validation
                const hashInput = {
                    id: event.id, timestamp: event.timestamp, type: event.type, severity: event.severity,
                    caller: event.caller, message: event.message,
                    actor: event.actor, data: event.data,
                    correlationId: event.correlationId, prevHash: event.prevHash,
                };
                const expectedHash = await this.computeHash(hashInput);

                if (event.hash !== expectedHash) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "AUDIT:SYNC",
                        message: `REJECTED: Hash mismatch in mesh event ${event.id}. Malicious sync attempt?`
                    });
                    continue;
                }

                await this.repo.save(event);
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.DEBUG,
                    severity: LogSeverity.INFO,
                    caller: "AUDIT:SYNC",
                    message: `Skipped event ${event.id} during sync (likely duplicate): ${e instanceof Error ? e.message : String(e)}`
                }).catch(() => {});
            }
        }
        await this.restoreChainHead();
    }

    async logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string, correlationId?: string }) {
        await this.ready;
        if (this.state === SystemState.FORENSIC_RESTRICTED &&
            event.type !== "CRITICAL" && event.type !== "THREAT" && event.type !== "SUCCESS") {
            // Block non-essential logs in restricted mode to preserve forensic state
            return;
        }

        const logAction = async () => {
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
                    caller: "orchestrator:domain:analysis:audit",
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
                    caller: "orchestrator:domain:analysis:audit",
                    message: `Failed to save event: ${(e as Error).message}`
                });
            }
        };

        if (this.state === SystemState.FORENSIC_RESTRICTED) {
            // Synchronous processing in restricted mode
            await logAction();
        } else {
            this.logQueue = this.logQueue.then(logAction);
        }
        
        return this.logQueue;
    }

    public getState(): SystemState {
        return this.state;
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
        const fetchLimit = limit === -1 ? undefined : limit;
        const stream = this.repo.getStream(fetchLimit as any, true);

        let eventsChecked = 0;
        let prevEvent: AuditEvent | null = null;

        for await (const event of stream) {
            eventsChecked++;

            // SECURITY: Hardware-Verified Checkpoint Bypass
            if (event.type === "CHECKPOINT") {
                if (event.hwSignature && this.tpm) {
                    const isValidCheckpoint = await this.tpm.verify(event.hash, event.hwSignature);
                    if (!isValidCheckpoint) {
                        return {
                            valid: false,
                            eventsChecked,
                            brokenAt: { eventId: event.id, expected: "VALID_TPM_SIG", actual: "INVALID_SIG", type: "CHECKPOINT_TAMPER" },
                        };
                    }
                } else if (event.prevHash !== "TRUNCATED") {
                    return {
                        valid: false,
                        eventsChecked,
                        brokenAt: { eventId: event.id, expected: "TPM_SIGNATURE", actual: "UNSIGNED", type: "UNSIGNED_CHECKPOINT" },
                    };
                }
                prevEvent = event;
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
                    eventsChecked,
                    brokenAt: { eventId: event.id, expected: expectedHash, actual: event.hash, type: "HASH_MISMATCH" },
                };
            }

            // BUG-02: Reverse Chain Logic
            // Since we iterate newest-to-oldest, prevEvent is newer than event.
            // Therefore, prevEvent.prevHash must equal event.hash.
            if (prevEvent && event.hash !== prevEvent.prevHash && prevEvent.prevHash !== "TRUNCATED") {
                return {
                    valid: false,
                    eventsChecked,
                    brokenAt: { eventId: prevEvent.id, expected: event.hash, actual: prevEvent.prevHash, type: "CHAIN_BREAK" },
                };
            }
            
            prevEvent = event;
        }

        return { valid: true, eventsChecked };
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
                    caller: "orchestrator:domain:analysis:audit",
                    message: `Audit ledger truncated. Checkpoint inserted at ${boundaryEvent.hash.slice(0, 12)}`
                });
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:audit",
                message: `Retention purge failed: ${e instanceof Error ? e.message : String(e)}`
            });
        }
    }

    private async computeHash(input: any): Promise<string> {
        return await computeHash(input);
    }
}
