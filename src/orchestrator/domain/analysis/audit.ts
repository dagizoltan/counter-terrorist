import { LoggingPort, LogSeverity, LogType, TpmPort } from "@core/ports.ts";
import { MeshManager } from "../orchestration/mesh.ts";
import { AuditRepository } from "../repositories/audit_repository.ts";
import { computeHash } from "@core/crypto_utils.ts";
import { BaseService } from "@core/base_service.ts";
import { MerkleTree } from "@core/merkle.ts";
import { AuditVerifier } from "./audit_verifier.ts";
import { Result, ok, err } from "@core/result.ts";
import { ServiceLocatorPort } from "../../core/ports.ts";
import { WormRepository } from "../repositories/worm_repository.ts";
import { BackgroundTaskManager } from "../../core/utils/background_task_manager.ts";
import { secureRandomInt } from "../../core/crypto_utils.ts";

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
    data?: Record<string, unknown>;
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
    oldValue: unknown;
    newValue: unknown;
}

interface RetentionConfig {
    maxAgeDays: number;
    maxEvents: number;
}

interface AuditCorrelation {
    processEvent(event: AuditEvent): Promise<void>;
}

type KvWatchable = {
    watch(keys: string[][], options: { signal: AbortSignal }): AsyncIterable<{ key: unknown[]; value: unknown; oldValue?: unknown }>;
};

function sanitizeDataForAudit(obj: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (depth > 6) return "[Truncated: Max Depth]";
    if (typeof obj === "bigint") return obj.toString() + "n";
    if (typeof obj === "symbol") return obj.toString();
    if (obj === null || typeof obj !== "object") return obj;
    if (seen.has(obj as object)) return "[Circular]";
    seen.add(obj as object);

    if (Array.isArray(obj)) {
        return obj.slice(0, 50).map(item => sanitizeDataForAudit(item, depth + 1, seen));
    }
    const record = obj as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(record).slice(0, 50)) {
        if (typeof v === "function") continue;
        try {
            sanitized[k] = sanitizeDataForAudit(v, depth + 1, seen);
        } catch {
            sanitized[k] = "[Unserializable]";
        }
    }
    return sanitized;
}

type AuditBroadcastPayload = Parameters<MeshManager["broadcastAuditEvent"]>[0];

/**
 * AuditService
 * Hardware-rooted immutable ledger logic.
 * Decoupled from persistence via AuditRepository.
 */
/**
 * AuditService implements a hardware-rooted immutable ledger for all security events.
 * It ensures chain integrity through cryptographic hashing and TPM-based signing.
 */
export class AuditService extends BaseService {
    private lastHash: string = "GENESIS";
    private lastVerifiedHash: string = "GENESIS";
    private retentionConfig: RetentionConfig;
    private state: SystemState = SystemState.NORMAL;

    private logQueue: Array<Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string, correlationId?: string, fromAudit?: boolean }> = [];
    private isProcessingQueue = false;

    private auditBuffer: AuditEvent[] = [];
    private intervals: number[] = [];
    private taskManager: BackgroundTaskManager;
    private watcherAbortController: AbortController | null = null;

    // Merkle Integration
    private currentSessionHashes: string[] = [];
    private merkleTree: MerkleTree = new MerkleTree();
    declare public locator?: ServiceLocatorPort;
    private wormRepo: WormRepository | null = null;

    public setWormRepository(repo: WormRepository) {
        this.wormRepo = repo;
    }

    public setLocator(locator: ServiceLocatorPort) {
        this.locator = locator;
    }

    public setVerifier(verifier: AuditVerifier) {
        this.verifier = verifier;
    }

    public getRepo(): AuditRepository {
        return this.repo;
    }

    public getVerifier(): AuditVerifier {
        return this.verifier;
    }

    constructor(
        private repo: AuditRepository,
        private logging: LoggingPort,
        private verifier: AuditVerifier,
        private tpm?: TpmPort,
        private mesh: MeshManager | null = null,
        private correlation?: AuditCorrelation
    ) {
        super();
        this.retentionConfig = {
            maxAgeDays: 90,
            maxEvents: 10000,
        };
        this.taskManager = new BackgroundTaskManager(logging);
    }

    protected override async onInit(): Promise<Result<void>> {
        const restoreRes = await this.restoreChainHead();
        if (!restoreRes.success) {
            return restoreRes;
        }

        // SOV-M5 FIX: Transition to secure random jitter
        const jitter = (ms: number) => ms + secureRandomInt(0, 5000);

        this.taskManager.schedule("purgeExpired", jitter(60 * 60 * 1000), () => this.purgeExpired());
        this.taskManager.schedule("emitMetrics", jitter(30000), () => this.emitMetrics());

        this.taskManager.schedule("broadcastAuditVerification", jitter(5 * 60 * 1000), async () => {
            if (this.eventBus) {
                const status = await this.getChainStatus();
                await this.eventBus.publish("AUDIT_VERIFICATION", "Audit Verification Broadcast", {
                    lastHash: status.lastHash,
                    eventCount: status.count
                });
            }
        });

        this.taskManager.schedule("verifyChainIncremental", jitter(60 * 1000), async () => {
            await this.verifyChainIncremental();
        });

        this.taskManager.schedule("commitMerkleRoot", jitter(600000), async () => { await this.commitMerkleRoot(); });
        this.taskManager.schedule("archiveToColdStorage", jitter(12 * 60 * 60 * 1000), async () => { await this.archiveToColdStorage(); });
        this.taskManager.schedule("flushBuffer", 1000, async () => { await this.flushBuffer(); });

        this.startLedgerWatcher();
        return ok(undefined);
    }

    /**
     * Reactive state: Watch for ledger changes from other nodes
     */
    private async startLedgerWatcher() {
        const kv = (this.repo as unknown as { kv?: Deno.Kv }).kv;
        if (!kv) return;

        this.watcherAbortController = new AbortController();
        const watcher = (kv as KvWatchable).watch([["audit", "latest"]], { signal: this.watcherAbortController.signal });
        try {
            for await (const entry of watcher) {
                if (entry && typeof entry === "object" && entry !== null && "value" in entry) {
                    const latestEvent = (entry as { value: unknown }).value as AuditEvent;
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

    public setConfig(config: { getNumber?(key: string, def: number): number } | Record<string, unknown>) {
        const typedConfig = config as { getNumber?(key: string, def: number): number };
        if (typeof typedConfig.getNumber === "function") {
            this.retentionConfig = {
                maxAgeDays: typedConfig.getNumber("AUDIT_RETENTION_DAYS", 90),
                maxEvents: typedConfig.getNumber("AUDIT_MAX_EVENTS", 10000),
            };
        } else {
            const recordConfig = config as Record<string, unknown>;
            this.retentionConfig = {
                maxAgeDays: typeof recordConfig["AUDIT_RETENTION_DAYS"] === "number" ? recordConfig["AUDIT_RETENTION_DAYS"] as number : 90,
                maxEvents: typeof recordConfig["AUDIT_MAX_EVENTS"] === "number" ? recordConfig["AUDIT_MAX_EVENTS"] as number : 10000,
            };
        }
    }

    private async emitMetrics() {
        if (!this.eventBus) return;
        const status = await this.getChainStatus();

        // SEC-03: Audit Metrics Integrity.
        // Metrics now reflect the actual real-time verification state of the ledger chain
        // rather than a hardcoded 'true' value.
        const isVerified = this.lastHash === this.lastVerifiedHash && this.lastVerifiedHash !== "GENESIS";

        await this.eventBus.emit("METRIC_UPDATE", {
            domain: "audit",
            data: {
                chainVerified: isVerified,
                totalEvents: status.count,
                hardwareVerified: !!this.tpm
            }
        });
    }

    protected override async onShutdown(): Promise<Result<void>> {
        // STABILITY: Ensure all intervals and timers are cleared to prevent hanging
        this.taskManager.shutdown();

        if (this.watcherAbortController) {
            this.watcherAbortController.abort();
            this.watcherAbortController = null;
        }

        // STABILITY: Drain queue first so currentSessionHashes is populated before Merkle commitment
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

    private isArchiving = false;
    /**
     * Cold Storage: Background lifecycle management for the audit ledger.
     * Verified Merkle blocks are moved to long-term WORM storage.
     */
    private async archiveToColdStorage() {
        if (this.isArchiving || !this.wormRepo) return;
        this.isArchiving = true;

        try {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.INFO,
                caller: "AUDIT:ARCHIVE",
                message: "Starting background ledger archiving to cold storage..."
            });

            // 1. Identify older, verified blocks.
            // We keep the last 7 days of logs in hot storage (KV).
            const archiveThreshold = Date.now() - (7 * 24 * 60 * 60 * 1000);

            // 2. Stream events from repo
            const stream = this.repo.getStream(10000, false); // Oldest first
            const batch: AuditEvent[] = [];

            for await (const event of stream) {
                const ts = new Date(event.timestamp).getTime();
                if (ts >= archiveThreshold) break;

                batch.push(event);

                if (batch.length >= 100) {
                    await this.processArchiveBatch(batch);
                    batch.length = 0;
                }
            }

            if (batch.length > 0) {
                await this.processArchiveBatch(batch);
            }

            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.SUCCESS,
                caller: "AUDIT:ARCHIVE",
                message: "Ledger archiving cycle complete."
            });
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "AUDIT:ARCHIVE",
                message: `Archiving failed: ${(e as Error).message}`
            });
        } finally {
            this.isArchiving = false;
        }
    }

    private async processArchiveBatch(batch: AuditEvent[]) {
        if (!this.wormRepo) return;

        // SEC-05: Transactional Forensic Archiving.
        // Ensure successful WORM commitment before identifying the boundary for KV truncation.
        let successCount = 0;
        for (const event of batch) {
            try {
                await this.wormRepo.append(event);
                successCount++;
            } catch (e) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "AUDIT:ARCHIVE",
                    message: `Failed to commit event ${event.id} to WORM storage: ${(e as Error).message}`
                });
                // If any event in the batch fails archival, we MUST NOT truncate KV yet.
                throw e;
            }
        }

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "AUDIT:ARCHIVE",
            message: `Successfully archived batch of ${successCount} events to WORM.`
        });

        // Remove from hot storage (KV)
        // Note: TimelineRepository doesn't have a single-event delete by timestamp+id exposed easily here,
        // but we can use deleteBefore on the oldest timestamp in the next batch if we want to be aggressive,
        // or just let purgeExpired handle it.
        // For this architectural upgrade, we rely on purgeExpired to eventually clean up KV,
        // while archiveToColdStorage ensures we have a permanent record even if KV is purged.
    }

    private isCommittingMerkle = false;
    private safeLogAuditError(message: string, error: Error) {
        // STABILITY: Avoid infinite recursion by checking if the logger is already in a failure state
        // We log to console as a last resort for audit failures
        console.error(`[AUDIT_FATAL] ${message}: ${error.message}`);

        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.ERROR,
            caller: "AUDIT:FATAL",
            message: `${message}: ${error.message}`,
            fromAudit: true // CRITICAL: Prevent AuditService from trying to log this event to the ledger
        }).catch(() => {
            // Absolute last resort
            console.error("Audit logging itself failed and cannot be recovered.");
        });
    }

    private async commitMerkleRoot() {
        if (this.currentSessionHashes.length === 0 || this.isCommittingMerkle) return;

        // SEC-03: PCR-Sealed Ledger logic.
        // We only commit a Merkle root if the hardware integrity is verified.
        if (this.tpm) {
            const isHealthy = await this.tpm.verifyIntegrity();
            if (!isHealthy) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "AUDIT:MERKLE",
                    message: "CRITICAL: Merkle commitment blocked. Hardware integrity (PCR) violation detected."
                });
                return;
            }
        }

        this.isCommittingMerkle = true;

        // Optimized Queue-Swap Pattern
        // Swap out the current buffer immediately to ensure no events are lost
        // during the asynchronous Merkle root calculation.
        const hashesToCommit = [...this.currentSessionHashes];
        this.currentSessionHashes = [];

        try {
            const tree = new MerkleTree(hashesToCommit);
            const root = await tree.getRoot();

            // SEC-03: Signed Merkle Commitment.
            const hwSignature = this.tpm ? await this.tpm.sign(root) : undefined;

            await this.logEvent({
                type: "MERKLE_COMMIT",
                severity: "info",
                caller: "AUDIT:MERKLE",
                message: `Merkle Root committed for ${hashesToCommit.length} events: ${root.slice(0, 12)}`,
                data: { root, eventCount: hashesToCommit.length, hwSignature }
            });

            // SEC-05: Anchor the root across the mesh
            // SEC-05: Anchor the root across the mesh
            if (this.eventBus) {
                this.eventBus.publish("AUDIT_VERIFICATION", "Merkle verification", {
                    lastHash: root,
                    eventCount: hashesToCommit.length
                }).catch((e: Error) => {
                    this.safeLogAuditError("Failed to broadcast Merkle verification", e);
                });
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:domain:analysis:audit",
                message: `Merkle commitment failed: ${(e as Error).message}`
            });
            // Re-insert hashes at the beginning if commitment failed to try again later
            this.currentSessionHashes = [...hashesToCommit, ...this.currentSessionHashes];
        } finally {
            this.isCommittingMerkle = false;
        }
    }

    public setCorrelation(correlation?: AuditCorrelation) {
        this.correlation = correlation;
    }

    public getLogging(): LoggingPort {
        return this.logging;
    }

    public async getRecentEvents(limit: number = 100): Promise<AuditEvent[]> {
        return await this.repo.getLatest(limit);
    }

    public async getEventsInRange(startHash: string, limit: number = 50): Promise<AuditEvent[]> {
        const stream = this.repo.getStream(1000, true);
        const events: AuditEvent[] = [];
        let found = false;

        for await (const event of stream) {
            if (found) {
                events.push(event);
                if (events.length >= limit) break;
            }
            if (event.hash === startHash) {
                found = true;
            }
        }
        return events;
    }

    public async getMerkleProof(eventHash: string): Promise<{ leaf: string, index: number, proof: string[], root: string } | null> {
        const WINDOW_SIZE = 1000;
        const recent = await this.getRecentEvents(WINDOW_SIZE);
        return await this.verifier.getMerkleProof(eventHash, recent);
    }

    /**
     * Event Sourcing: Project current ledger state from event stream.
     */
    public async projectState(limit: number = 1000): Promise<AuditEvent[]> {
        // 1. Fetch base events
        const baseEvents = await this.repo.getLatest(limit);

        // 2. Fetch deltas (if repository supported it, we'd query them)
        // For now, we return base events as the "projection"
        return baseEvents;
    }

    private async restoreChainHead(): Promise<Result<void>> {
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

                const verification = await this.verifier.verifyChain(50);
                if (!verification.valid) {
                    const isDev = this.config?.getBoolean("CTS_DEV_MODE", false) || this.config?.getEnv("ENVIRONMENT") !== "production";
                    const healDisabled = this.config?.getBoolean("DISABLE_DEV_AUDIT_HEAL", false) || Deno.env.get("HEAL_DEV_AUDIT_LEDGER") === "false";
                    if (isDev && !healDisabled) {
                        this.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.AUDIT,
                            severity: LogSeverity.WARNING,
                            caller: "orchestrator:domain:analysis:audit",
                            message: `[DEV MODE] Chain integrity verification failed for legacy events (${verification.brokenAt?.type}). Auto-healing audit chain boundary...`
                        });
                        await this.healDevChainBoundary();
                        return ok(undefined);
                    }

                    const errorMsg = "CHAIN INTEGRITY FAILURE. TAMPERING DETECTED. FORCING EMERGENCY LOCKDOWN.";
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:domain:analysis:audit",
                        message: errorMsg
                    });
                    // Immediate transition to restricted mode AND system lockdown if tampering is detected on boot.
                    this.state = SystemState.FORENSIC_RESTRICTED;

                    if (this.eventBus) {
                        await this.eventBus.emit("CRITICAL", {
                            message: "Audit Chain Integrity Violation during boot sequence.",
                            source: "AuditService:boot",
                            type: "LEDGER_TAMPER",
                            data: { ...verification.brokenAt, reason: "RESTORE_CHAIN_HEAD_FAILURE" }
                        } as never);
                    }

                    return err(new Error(errorMsg));
                } else {
                    this.lastVerifiedHash = this.lastHash;
                }
            }
            return ok(undefined);
        } catch (e) {
            const msg = `Failed to restore chain head: ${e instanceof Error ? e.message : String(e)}`;
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:domain:analysis:audit",
                message: msg
            });
            return err(new Error(msg));
        }
    }

    private async healDevChainBoundary() {
        const id = crypto.randomUUID();
        const timestamp = new Date().toISOString();
        const hashInput = {
            id, timestamp, type: "CHECKPOINT", severity: LogSeverity.INFO,
            caller: "AUDIT:DEV_HEAL", message: "Dev Mode: Audit chain reset checkpoint inserted.",
            data: { reason: "DEV_MODE_AUTO_HEAL" },
            prevHash: "TRUNCATED",
        };
        const hash = await computeHash(hashInput);

        const checkpoint: AuditEvent = {
            id,
            timestamp,
            type: "CHECKPOINT",
            severity: LogSeverity.INFO,
            caller: "AUDIT:DEV_HEAL",
            message: "Dev Mode: Audit chain reset checkpoint inserted.",
            hash,
            prevHash: "TRUNCATED",
            data: { reason: "DEV_MODE_AUTO_HEAL" },
            hwSignature: this.tpm ? await this.tpm.sign(hash) : undefined,
            formatted: "[CHECKPOINT] [info] [AUDIT:DEV_HEAL] Dev Mode: Audit chain reset checkpoint inserted."
        };

        await this.repo.save(checkpoint);
        this.lastHash = hash;
        this.lastVerifiedHash = hash;
    }

    public async syncEvents(events: AuditEvent[]) {
        for (const event of events) {
            if (event.hash === this.lastHash) continue;

            // Validate event integrity before accepting remote chain pieces.
            const expectedHash = await computeHash({
                id: event.id,
                timestamp: event.timestamp,
                type: event.type,
                severity: event.severity,
                caller: event.caller,
                message: event.message,
                actor: event.actor,
                data: event.data,
                correlationId: event.correlationId,
                prevHash: event.prevHash
            });

            if (event.hash !== expectedHash) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:domain:analysis:audit",
                    message: `Rejected synced audit event ${event.id} due to checksum mismatch`,
                    payload: { expectedHash, actualHash: event.hash }
                }).catch(err => this.safeLogAuditError("Background task failure", err));
                continue;
            }

            // SEC-03: Signed Truncation Boundary Verification
            // If the event marks a new chain head (prevHash: TRUNCATED), it MUST be a CHECKPOINT with a valid hardware signature.
            if (event.prevHash === "TRUNCATED" && event.type !== "CHECKPOINT") {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:domain:analysis:audit",
                    message: `Rejected unverified chain truncation for event ${event.id}. Remote nodes must provide a signed CHECKPOINT to reset the chain head.`
                }).catch(err => this.safeLogAuditError("Background task failure", err));
                continue;
            }

            if (event.type === "CHECKPOINT" && event.prevHash === "TRUNCATED" && this.tpm) {
                if (!event.hwSignature) {
                     this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:domain:analysis:audit",
                        message: `Rejected unsigned CHECKPOINT ${event.id} as a truncation boundary.`
                    }).catch(err => this.safeLogAuditError("Background task failure", err));
                    continue;
                }
                const isValid = await this.tpm.verify(event.hash, event.hwSignature);
                if (!isValid) {
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:domain:analysis:audit",
                        message: `Rejected CHECKPOINT ${event.id} with INVALID hardware signature.`
                    }).catch(err => this.safeLogAuditError("Background task failure", err));
                    continue;
                }
            }

            if (event.prevHash !== this.lastHash && event.prevHash !== "TRUNCATED") {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:domain:analysis:audit",
                    message: `Rejected synced audit event ${event.id} due to chain gap: expected prevHash ${this.lastHash}`,
                    payload: { eventPrevHash: event.prevHash }
                }).catch(err => this.safeLogAuditError("Background task failure", err));
                continue;
            }

            await this.repo.save(event);
            this.lastHash = event.hash;
        }
    }

    /**
     * Appends a new event to the audit ledger.
     * Automatically handles hashing, signing, and background persistence.
     *
     * @param event The event data to log
     */
    logEvent(event: Omit<AuditEvent, "id" | "timestamp" | "hash" | "prevHash"> & { timestamp?: string, correlationId?: string, fromAudit?: boolean }) {
        this.ensureReady();
        // STABILITY: Immediate drop if event is from audit itself to prevent recursion
        if (event.fromAudit) return;

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

        const sanitizedData = event.data ? sanitizeDataForAudit(event.data) as Record<string, unknown> : undefined;
        this.logQueue.push({ ...event, data: sanitizedData });
        if (!this.isProcessingQueue) {
            this.processQueue().catch((err) => {
                this.safeLogAuditError("Audit processing failed", err);
            });
        }
    }

    private async processQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        try {
            while (this.logQueue.length > 0) {
                const currentQueue = this.logQueue;
                this.logQueue = [];

                for (let i = 0; i < currentQueue.length; i++) {
                    const event = currentQueue[i];
                    const id = crypto.randomUUID();
                    const timestamp = event.timestamp || new Date().toISOString();
                    const prevHash = this.lastHash;

                    try {
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
                        const { fromAudit: _fromAudit, ...eventPayload } = event;
                        const auditEvent: AuditEvent = {
                            ...eventPayload,
                            id,
                            timestamp,
                            hash,
                            prevHash,
                            hwSignature,
                            formatted
                        };

                        this.auditBuffer.push(auditEvent);
                        this.lastHash = hash;

                        if (event.type !== "MERKLE_COMMIT") {
                            // Incremental Merkle Update
                            await this.merkleTree.addLeaf(hash);
                            this.currentSessionHashes.push(hash);

                            // STABILITY: Bound Merkle Tree Memory to prevent OOM during high-activity incidents
                            const MAX_MERKLE_BUFFER = 5000;
                            if (this.currentSessionHashes.length >= MAX_MERKLE_BUFFER) {
                                this.commitMerkleRoot().catch(err => this.safeLogAuditError("Background Merkle commitment failure", err));
                            }
                        }

                        const severity = (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT") ? LogSeverity.WARNING : LogSeverity.INFO;
                        this.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.AUDIT,
                            severity,
                            caller: "orchestrator:domain:analysis:audit",
                            message: `${auditEvent.type}: ${auditEvent.message} (Actor: ${auditEvent.actor?.id || "SYSTEM"})`,
                            payload: auditEvent.data,
                            fromAudit: true
                        }).catch(err => {
                            console.error(`[AUDIT:LOG_FAIL] ${err.message}`);
                        });

                        if (this.eventBus && (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT")) {
                            this.eventBus.publish("AUDIT_BROADCAST", "Audit Broadcast", auditEvent as any).catch((e: Error) => {
                                this.safeLogAuditError("Failed to broadcast audit event", e);
                            });
                        }

                        if (this.correlation) {
                            this.correlation.processEvent(auditEvent).catch(e => {
                                this.safeLogAuditError(`Failed to process correlation for event ${auditEvent.id}`, e);
                            });
                        }

                        if (this.wormRepo && (auditEvent.type === "CRITICAL" || auditEvent.type === "THREAT" || auditEvent.type === "MERKLE_COMMIT")) {
                            await this.wormRepo.append(auditEvent).catch(e => {
                                this.logging.log({
                                    timestamp: new Date().toISOString(),
                                    type: LogType.GENERIC,
                                    severity: LogSeverity.ERROR,
                                    caller: "AUDIT:WORM",
                                    message: `Failed to mirror log to WORM persistence: ${e.message}`
                                });
                            });
                        }

                        if (this.auditBuffer.length >= 100 || this.state === SystemState.FORENSIC_RESTRICTED) {
                            await this.flushBuffer();
                        }
                    } catch (e) {
                        this.logQueue.unshift(...currentQueue.slice(i));
                        throw e;
                    }
                }
            }
        } finally {
            this.isProcessingQueue = false;
        }
    }

    private isFlushing = false;
    private handleTaskError(e: Error, task: string) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:domain:analysis:audit",
            message: `Background task '${task}' failed: ${e.message}`
        }).catch(err => this.safeLogAuditError("Background task failure", err));

        if (this.locator?.has("health")) {
            const health = this.locator.get<import("./health_service.ts").HealthService>("health");
            health.reportStatus("audit", "DEGRADED", `Background task '${task}' failed: ${e.message}`);
        }
    }

    private async flushBuffer() {
        if (this.isFlushing || this.auditBuffer.length === 0) return;
        this.isFlushing = true;

        const toFlush = this.auditBuffer;
        this.auditBuffer = [];

        try {
            await this.repo.saveMany(toFlush);
        } catch (e: unknown) {
            this.auditBuffer.unshift(...toFlush);
            const error = e instanceof Error ? e : new Error(String(e));
            this.safeLogAuditError("Failed to flush audit batch", error);
        } finally {
            this.isFlushing = false;
        }
    }

    async getChainStatus(): Promise<{ lastHash: string; count: number; lastVerifiedHash: string }> {
        const count = await this.repo.count();
        return { lastHash: this.lastHash, count, lastVerifiedHash: this.lastVerifiedHash };
    }

    async verifyChainIncremental(): Promise<Result<void>> {
        if (this.lastHash === this.lastVerifiedHash) return ok(undefined);
        const res = await this.verifier.verifyChain(100);

        if (res.valid) {
            this.lastVerifiedHash = this.lastHash;
            return ok(undefined);
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
                await this.eventBus.emit("CRITICAL", {
                    message,
                    source: "AuditService",
                    type: "LEDGER_TAMPER",
                    data: res.brokenAt
                } as never);
            }

            return err(new Error(message));
        }
    }

    /**
     * Comprehensive forensic verification of the entire audit ledger.
     */
    public async verifyFullChain() {
        return await this.verifier.verifyFullChain();
    }

    async verifyChain(limit: number = 1000) {
        return await this.verifier.verifyChain(limit);
    }

    private async purgeExpired() {
        // STABILITY: Comprehensive retention enforcement.
        const cutoffTimestamp = Date.now() - (this.retentionConfig.maxAgeDays * 24 * 60 * 60 * 1000);

        try {
            // STREAMING RETENTION (Forward Scan)
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
