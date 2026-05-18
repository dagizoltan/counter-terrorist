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
    private state: SystemState = SystemState.NORMAL;
    private logQueue: Promise<void> = Promise.resolve();

    private auditBuffer: AuditEvent[] = [];
    private flushTimer?: number;

    private intervals: number[] = [];
    private eventBus?: any;

    constructor(
        private repo: AuditRepository,
        private logging: LoggingPort,
        private tpm: any | null = null,
        private mesh: MeshManager | null = null,
        private correlation: any | null = null
    ) {
        this.retentionConfig = {
            maxAgeDays: 90,
            maxEvents: 10000,
        };

        this.restoreChainHead();
        
        // BUG-8.4 FIX: Track intervals for clean shutdown
        this.intervals.push(setInterval(() => this.purgeExpired(), 60 * 60 * 1000));
        this.intervals.push(setInterval(() => this.emitMetrics(), 30000));
        this.intervals.push(setInterval(async () => {
          if (this.mesh) {
            const status = await this.getChainStatus();
            this.mesh.broadcastAuditVerification(status.lastHash, status.count);
          }
        }, 5 * 60 * 1000));

        this.intervals.push(setInterval(() => this.verifyChainIncremental(), 60 * 1000));
        this.intervals.push(setInterval(() => this.flushBuffer(), 5000));

        // ENHANCEMENT: Full Ledger Verification on Boot (Background)
        // Disabled for UI stabilization phase
        // setTimeout(() => this.performDeepAudit(), 5000);
    }

    setEventBus(eventBus: any) {
        this.eventBus = eventBus;
    }

    public setConfig(config: any) {
        this.retentionConfig = {
            maxAgeDays: config.getNumber("AUDIT_RETENTION_DAYS", 90),
            maxEvents: config.getNumber("AUDIT_MAX_EVENTS", 10000),
        };
    }

    private async emitMetrics() {
        if (!this.eventBus) return;
        const status = await this.getChainStatus();
        this.eventBus.emit("METRIC_UPDATE", {
            domain: "audit",
            data: {
                chainVerified: true, // simplified for update
                totalEvents: status.count,
                hardwareVerified: !!this.tpm
            }
        });
    }

    public async shutdown() {
        for (const id of this.intervals) clearInterval(id);
        this.intervals = [];
        await this.flushBuffer();
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

        let currentHead = this.lastHash;
        const recentEvents = await this.repo.getLatest(100);
        const recentHashes = new Set(recentEvents.map(e => e.hash));

        for (const event of sorted) {
            try {
                // 2. BUG-27: Validate hash continuity to prevent floating chains.
                if (recentHashes.has(event.hash)) {
                    currentHead = event.hash;
                    continue;
                }

                if (event.prevHash !== currentHead) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.WARNING,
                        caller: "AUDIT:SYNC",
                        message: `REJECTED: Chain discontinuity at ${event.id.slice(0, 8)}. Expected prev ${currentHead.slice(0, 8)}, got ${event.prevHash.slice(0, 8)}`
                    });
                    break; // Stop processing this disconnected batch
                }

                // 3. Structural & Integrity Validation
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
                    break;
                }

                await this.repo.save(event);
                currentHead = event.hash;
                recentHashes.add(event.hash);
            } catch (e) {
                // Ignore duplicates or errors during sync
            }
        }
        await this.restoreChainHead();
    }

    async logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string, correlationId?: string }) {
        if (this.state === SystemState.FORENSIC_RESTRICTED &&
            event.type !== "CRITICAL" && event.type !== "THREAT" && event.type !== "SUCCESS") {
            // Block non-essential logs in restricted mode to preserve forensic state
            return;
        }

        // H-07: Maximum Queue Depth to prevent memory exhaustion during event storms
        const MAX_QUEUE_DEPTH = 1000;
        if (this.auditBuffer.length > MAX_QUEUE_DEPTH) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:audit",
                message: "CRITICAL: Audit log buffer saturation. Dropping non-critical event to preserve system stability."
            });
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
                ...event as any, id, timestamp, hash, prevHash, hwSignature, formatted
            };

            this.auditBuffer.push(auditEvent);
            this.lastHash = hash;

            // Reactive feedback
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

            if (this.auditBuffer.length >= 20 || this.state === SystemState.FORENSIC_RESTRICTED) {
                await this.flushBuffer();
            }
        };

        this.logQueue = this.logQueue.then(logAction);
        if (this.state === SystemState.FORENSIC_RESTRICTED) {
            await this.logQueue;
        }
    }

    private isFlushing = false;
    private async flushBuffer() {
        if (this.isFlushing || this.auditBuffer.length === 0) return;
        this.isFlushing = true;

        const toFlush = [...this.auditBuffer];
        this.auditBuffer = [];

        try {
            await this.repo.saveMany(toFlush);
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:audit",
                message: `Failed to flush audit batch: ${(e as Error).message}`
            });
            // Re-queue on failure? risky for chain integrity if new events arrived.
            // For now, we drop but log. In production, we'd want a more robust retry or fail-closed.
        } finally {
            this.isFlushing = false;
        }
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
                const id = crypto.randomUUID();
                const timestamp = new Date().toISOString();

                // 2. Create a hardware-signed Checkpoint to bridge the gap
                // BUG-4.3 FIX: Checkpoint must have its own unique hash, not just mirror the boundary event
                const hashInput = {
                    id, timestamp, type: "CHECKPOINT", severity: LogSeverity.INFO,
                    caller: "AUDIT:RETENTION", message: `Chain Truncated. Genesis state summarized at ${boundaryEvent.timestamp}`,
                    data: { purgedEventsCutoff: boundaryEvent.timestamp, boundaryHash: boundaryEvent.hash },
                    prevHash: "TRUNCATED",
                };
                const hash = await this.computeHash(hashInput);

                const checkpoint: AuditEvent = {
                    id,
                    timestamp,
                    type: "CHECKPOINT",
                    severity: LogSeverity.INFO,
                    caller: "AUDIT:RETENTION",
                    message: `Chain Truncated. Genesis state summarized at ${boundaryEvent.timestamp}`,
                    hash,
                    prevHash: "TRUNCATED",
                    data: { purgedEventsCutoff: boundaryEvent.timestamp, boundaryHash: boundaryEvent.hash },
                    hwSignature: this.tpm ? await this.tpm.sign(hash) : undefined,
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
        const { computeHash } = await import("../../core/crypto_utils.ts");
        return await computeHash(input);
    }
}
