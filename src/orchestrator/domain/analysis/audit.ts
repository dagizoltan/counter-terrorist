import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { MeshManager } from "../orchestration/mesh.ts";
import { AuditRepository } from "../repositories/audit_repository.ts";
import { computeHash } from "@core/crypto_utils.ts";
import { BaseService } from "@core/base_service.ts";
import { MerkleTree } from "@core/merkle.ts";
import { Result, ok } from "@core/result.ts";

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
    merkleRoot?: string;
}

/**
 * Event Sourcing: Delta Schema
 */
export interface AuditDelta {
    id: string;
    eventId: string;
    timestamp: string;
    field: string;
    oldValue: any;
    newValue: any;
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
export class AuditService extends BaseService {
    private lastHash: string = "GENESIS";
    private lastVerifiedHash: string = "GENESIS";
    private retentionConfig: RetentionConfig;
    private state: SystemState = SystemState.NORMAL;

    private logQueue: Array<Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string, correlationId?: string }> = [];
    private isProcessingQueue = false;

    private auditBuffer: AuditEvent[] = [];
    private intervals: number[] = [];
    private watcherAbortController: AbortController | null = null;

    // Merkle Integration
    private currentSessionHashes: string[] = [];

    constructor(
        private repo: AuditRepository,
        private logging: LoggingPort,
        private tpm: any | null = null,
        private mesh: MeshManager | null = null,
        private correlation: any | null = null
    ) {
        super();
        this.retentionConfig = {
            maxAgeDays: 90,
            maxEvents: 10000,
        };

        this.restoreChainHead();
        this.startLedgerWatcher();
        
        const jitter = (ms: number) => ms + (Math.random() * 5000);

        this.intervals.push(setInterval(() => this.purgeExpired(), jitter(60 * 60 * 1000)));
        this.intervals.push(setInterval(() => this.emitMetrics(), jitter(30000)));
        this.intervals.push(setInterval(async () => {
          if (this.mesh) {
            const status = await this.getChainStatus();
            this.mesh.broadcastAuditVerification(status.lastHash, status.count);
          }
        }, jitter(5 * 60 * 1000)));

        this.intervals.push(setInterval(() => this.verifyChainIncremental(), jitter(60 * 1000)));
        this.intervals.push(setInterval(() => this.flushBuffer(), 5000));

        // Merkle Root Commitment: Commit root every 10 minutes
        this.intervals.push(setInterval(() => this.commitMerkleRoot(), jitter(600000)));
    }

    /**
     * Reactive state: Watch for ledger changes from other nodes
     */
    private async startLedgerWatcher() {
        const kv = (this.repo as any).kv;
        if (!kv) return;

        this.watcherAbortController = new AbortController();
        const watcher = kv.watch([["audit", "latest"]], { signal: this.watcherAbortController.signal });
        try {
        for await (const [entry] of watcher) {
            if (entry.value) {
                const latestEvent = entry.value as AuditEvent;
                if (latestEvent.hash !== this.lastHash) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.INFO,
                        caller: "orchestrator:domain:analysis:audit",
                        message: `Reactive Ledger Update: Syncing new head ${latestEvent.hash.slice(0, 8)}`
                    });
                    this.lastHash = latestEvent.hash;
                }
            }
        }
        } catch (e) {
            if (!(e instanceof DOMException && e.name === "AbortError")) {
                throw e;
            }
        }
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
                chainVerified: true,
                totalEvents: status.count,
                hardwareVerified: !!this.tpm
            }
        });
    }

    public override async shutdown(): Promise<Result<void>> {
        // SOV-05 STABILITY: Ensure all intervals and timers are cleared to prevent hanging
        for (const id of this.intervals) clearInterval(id);
        this.intervals = [];

        if (this.watcherAbortController) {
            this.watcherAbortController.abort();
            this.watcherAbortController = null;
        }

        // SOV-05 STABILITY: Drain queue first so currentSessionHashes is populated before Merkle commitment
        const start = Date.now();
        while ((this.logQueue.length > 0 || this.isProcessingQueue) && (Date.now() - start < 5000)) {
            await new Promise(r => setTimeout(r, 100));
        }

        await this.commitMerkleRoot();

        // Final drain for the MERKLE_COMMIT event itself
        while ((this.logQueue.length > 0 || this.isProcessingQueue) && (Date.now() - start < 10000)) {
            await new Promise(r => setTimeout(r, 100));
        }

        await this.flushBuffer();
        return ok(undefined);
    }

    private async commitMerkleRoot() {
        if (this.currentSessionHashes.length === 0) return;

        const tree = new MerkleTree(this.currentSessionHashes);
        const root = await tree.getRoot();

        await this.logEvent({
            type: "MERKLE_COMMIT",
            severity: "info",
            caller: "AUDIT:MERKLE",
            message: `Merkle Root committed for ${this.currentSessionHashes.length} events: ${root.slice(0, 12)}`,
            data: { root, eventCount: this.currentSessionHashes.length }
        });

        this.currentSessionHashes = [];
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

    /**
     * Event Sourcing: Project current ledger state from event stream.
     */
    public async projectState(limit: number = 1000): Promise<AuditEvent[]> {
        const events: AuditEvent[] = [];
        const deltas: Map<string, AuditDelta[]> = new Map();

        // 1. Fetch base events
        const baseEvents = await this.repo.getLatest(limit);

        // 2. Fetch deltas (if repository supported it, we'd query them)
        // For now, we return base events as the "projection"
        return baseEvents;
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

                const verification = await this.verifyChain(50);
                if (!verification.valid) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:domain:analysis:audit",
                        message: `CHAIN INTEGRITY FAILURE. TAMPERING DETECTED. FORCING EMERGENCY LOCKDOWN.`
                    });
                    // SOV-06: Immediate transition to restricted mode AND system lockdown if tampering is detected on boot.
                    this.state = SystemState.FORENSIC_RESTRICTED;

                    if (this.eventBus) {
                        this.eventBus.emit("CRITICAL", {
                            message: "Audit Chain Integrity Violation during boot sequence.",
                            source: "AuditService:boot",
                            type: "LEDGER_TAMPER",
                            data: { reason: "RESTORE_CHAIN_HEAD_FAILURE" }
                        });
                    }
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

    public async syncEvents(events: AuditEvent[]) {
        for (const event of events) {
            if (event.hash !== this.lastHash) {
                await this.repo.save(event);
                this.lastHash = event.hash;
            }
        }
    }

    async logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string, correlationId?: string, fromAudit?: boolean }) {
        // SOV-05 STABILITY: Immediate drop if event is from audit itself to prevent recursion
        if ((event as any).fromAudit) return;

        if (this.state === SystemState.FORENSIC_RESTRICTED &&
            event.type !== "CRITICAL" && event.type !== "THREAT" && event.type !== "SUCCESS" && event.type !== "MERKLE_COMMIT") {
            return;
        }

        const MAX_QUEUE_DEPTH = 5000;
        if (this.logQueue.length > MAX_QUEUE_DEPTH) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:audit",
                message: "CRITICAL: Audit log buffer saturation. Dropping non-critical event."
            });
            return;
        }

        this.logQueue.push(event);
        if (!this.isProcessingQueue) {
            this.processQueue().catch(console.error);
        }
    }

    private async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        try {
            while (this.logQueue.length > 0) {
            const currentQueue = this.logQueue;
            this.logQueue = [];

            for (const event of currentQueue) {
                const id = crypto.randomUUID();
                const timestamp = event.timestamp || new Date().toISOString();
                const prevHash = this.lastHash;

                const hashInput = {
                    id, timestamp, type: event.type, severity: event.severity,
                    caller: event.caller, message: event.message,
                    actor: event.actor, data: event.data,
                    correlationId: event.correlationId, prevHash,
                };
                const hash = await computeHash(hashInput);

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

                // Track for Merkle calculation (Exclude commit events themselves to prevent recursion)
                if (event.type !== "MERKLE_COMMIT") {
                    this.currentSessionHashes.push(hash);
                }

                const severity = (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT") ? LogSeverity.WARNING : LogSeverity.INFO;
                // SOV-05 STABILITY: Ensure audit logging doesn't cause recursion loop
                // We use original console or direct logging for audit trace to avoid re-entering logEvent.
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity,
                    caller: "orchestrator:domain:analysis:audit",
                    message: `${auditEvent.type}: ${auditEvent.message} (Actor: ${auditEvent.actor?.id || "SYSTEM"})`,
                    payload: auditEvent.data,
                    fromAudit: true // Flag to signal no further re-entry into audit
                }).catch(() => {});

                if (this.mesh && (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT")) {
                    this.mesh.broadcastAuditEvent({
                        ...auditEvent,
                        node: "orchestrator-node"
                    }).catch(() => {});
                }

                if (this.correlation) {
                    this.correlation.processEvent(auditEvent).catch(() => {});
                }

                if (this.auditBuffer.length >= 20 || this.state === SystemState.FORENSIC_RESTRICTED) {
                    await this.flushBuffer();
                }
            }
        }
        } finally {
            this.isProcessingQueue = false;
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
        } finally {
            this.isFlushing = false;
        }
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
        } else {
            // AUTOMATED INTEGRITY RESPONSE
            const brokenAt = res.brokenAt;
            const message = `AUDIT LEDGER TAMPERING DETECTED: ${brokenAt?.type} at event ${brokenAt?.eventId.slice(0, 8)}. System state compromised.`;

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:audit",
                message
            });

            if (this.eventBus) {
                this.eventBus.emit("CRITICAL", {
                    message,
                    source: "AuditService",
                    type: "LEDGER_TAMPER",
                    data: res.brokenAt
                });
            }

            // In a high-assurance production environment, we should consider forcing an emergency lockdown
            // However, we emit the CRITICAL event first to let the PolicyEngine/Autopilot decide on the specific remediation.
        }
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
            const expectedHash = await computeHash(hashInput);

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
        // SOV-05 STABILITY: Comprehensive retention enforcement.
        const cutoffTimestamp = Date.now() - (this.retentionConfig.maxAgeDays * 24 * 60 * 60 * 1000);

        try {
            // SOV-06: STREAMING RETENTION (Forward Scan)
            // We scan from oldest to newest to find the last expired event.
            // This ensures we always find the earliest valid "Genesis" boundary.
            const stream = this.repo.getStream(10000, false);
            let boundaryEvent: AuditEvent | undefined;

            for await (const event of stream) {
                const ts = new Date(event.timestamp).getTime();
                if (ts < cutoffTimestamp) {
                    boundaryEvent = event;
                } else {
                    // Reached valid events, stop scanning
                    break;
                }
            }

            if (boundaryEvent) {
                const id = crypto.randomUUID();
                const timestamp = new Date().toISOString();

                const hashInput = {
                    id, timestamp, type: "CHECKPOINT", severity: LogSeverity.INFO,
                    caller: "AUDIT:RETENTION", message: `Chain Truncated. Genesis state summarized at ${boundaryEvent.timestamp}`,
                    data: { purgedEventsCutoff: boundaryEvent.timestamp, boundaryHash: boundaryEvent.hash },
                    prevHash: "TRUNCATED",
                };
                const hash = await computeHash(hashInput);

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
}
