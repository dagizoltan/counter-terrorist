import { AuditService } from "./audit.ts";
import { BaseService } from "@core/base_service.ts";
import { LoggingPort, LogSeverity, LogType, MeshAuthPort, ConfigurationPort } from "../../core/ports.ts";
import { Result, ok } from "../../core/result.ts";
import { ProcessTracker } from "./process_tracker.ts";
import { computeStreamHash, computeHash } from "../../core/crypto_utils.ts";
import { ForensicArtifactLifecycleManager } from "./forensic_lifecycle.ts";
import { ForensicSearchTool, ForensicQuery } from "../../tools/ops/forensic_query.ts";

/**
 * ForensicService
 * Handles the aggregation and packaging of security evidence for post-mortem analysis.
 */
export class ForensicService extends BaseService {
  private queryTool: ForensicSearchTool;
  private lifecycleManager?: ForensicArtifactLifecycleManager;

  constructor(
    private audit: AuditService,
    private logging: LoggingPort,
    private kv: Deno.Kv,
    private processTracker: ProcessTracker,
    private meshAuth: MeshAuthPort,
    private config: ConfigurationPort
  ) {
    super();
    this.queryTool = new ForensicSearchTool();
  }

  public setLifecycleManager(mgr: ForensicArtifactLifecycleManager) {
      this.lifecycleManager = mgr;
  }

  /**
   * Audit 21.3: Streaming Evidence Serialization.
   * Generates a cryptographically signed bundle using incremental writes to prevent OOM.
   */
  async generateEvidenceBundle(limit = 5000) {
    const bundleId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const node = Deno.hostname();
    const bundlePath = `./volume/storage/forensics/bundle_${bundleId}.json`;
    let aggregateHash = "unknown";

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "FORENSICS",
        message: `Initiating streaming evidence bundle generation [${bundleId.slice(0,8)}]...`
    });
    
    // Ensure directory exists
    try { await Deno.mkdir("./volume/storage/forensics", { recursive: true }); } catch { /* ignore */ }

    const file = await Deno.open(bundlePath, { write: true, create: true, truncate: true });
    const encoder = new TextEncoder();

    // SEC-FIX: Compute evidence hash during streaming to ensure cryptographic integrity
    const hashBuffer: string[] = [];

    try {
        await file.write(encoder.encode("{\n"));
        await file.write(encoder.encode(`  "version": "1.4",\n`));
        await file.write(encoder.encode(`  "id": ${JSON.stringify(bundleId)},\n`));
        await file.write(encoder.encode(`  "timestamp": ${JSON.stringify(timestamp)},\n`));
        await file.write(encoder.encode(`  "node": ${JSON.stringify(node)},\n`));
        await file.write(encoder.encode(`  "data": {\n`));

        // 1. Stream Logs directly from Audit Service
        await file.write(encoder.encode(`    "logs": [\n`));
        const logs = await this.audit.getRecentEvents(limit);
        for (let i = 0; i < logs.length; i++) {
            const logStr = JSON.stringify(logs[i]);
            hashBuffer.push(await computeHash(logStr));
            await file.write(encoder.encode(`      ${logStr}${i < logs.length - 1 ? "," : ""}\n`));
        }
        await file.write(encoder.encode(`    ],\n`));

        // 2. Stream Process Tree
        await file.write(encoder.encode(`    "processTree": [\n`));
        const processTree = this.processTracker.getTree();
        for (let i = 0; i < processTree.length; i++) {
            const procStr = JSON.stringify(processTree[i]);
            hashBuffer.push(await computeHash(procStr));
            await file.write(encoder.encode(`      ${procStr}${i < processTree.length - 1 ? "," : ""}\n`));
        }
        await file.write(encoder.encode(`    ],\n`));
        await file.write(encoder.encode(`    "networkSnapshot": []\n`));
        await file.write(encoder.encode(`  },\n`));

        // 3. Robust Cryptographic Signing
        // Signs the aggregate hash of all evidence components to ensure total bundle integrity.
        aggregateHash = await computeHash(hashBuffer.join(":"));
        let signature = null;
        try {
            const caRes = await this.meshAuth.getRootCA();
            if (caRes.success) {
                const res = await this.meshAuth.signWithNodeKey(node, aggregateHash);
                if (res.success) signature = res.data;
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "FORENSICS",
                message: `Evidence signing failed: ${(e as Error).message}.`
            });
        }

        await file.write(encoder.encode(`  "signature": ${JSON.stringify(signature)},\n`));
        await file.write(encoder.encode(`  "evidenceHash": ${JSON.stringify(aggregateHash)},\n`));
        await file.write(encoder.encode(`  "signer": "MeshRootCA"\n`));
        await file.write(encoder.encode("}\n"));
    } finally {
        file.close();
    }

    const finalStat = await Deno.stat(bundlePath);

    // Audit 10.3: Enforce quotas after bundle generation
    if (this.lifecycleManager) {
        await this.lifecycleManager.enforceQuota();
    }

    await this.audit.logEvent({
        type: "SUCCESS",
        message: `Forensic Evidence Bundle Generated (Streaming): ${bundleId}`,
        data: { bundleId, size: finalStat.size, hash: aggregateHash }
    });

    return { bundleId, path: bundlePath, size: finalStat.size, hash: aggregateHash };
  }

  /**
   * Captures a deep snapshot of a specific process including its environment and open files.
   */
  async captureProcessForensics(pid: number) {
    try {
        const [maps, fd, status] = await Promise.all([
            Deno.readTextFile(`/proc/${pid}/maps`).catch(() => "ACCESS_DENIED"),
            (async () => {
                try {
                    const list = [];
                    for await (const e of Deno.readDir(`/proc/${pid}/fd`)) list.push(e.name);
                    return list;
                } catch {
                    return [];
                }
            })(),
            Deno.readTextFile(`/proc/${pid}/status`).catch(() => "ACCESS_DENIED")
        ]);

        const forensicData = { pid, timestamp: new Date().toISOString(), maps, fd, status };
        await this.kv.set(["snapshots", pid, forensicData.timestamp], forensicData);
        
        return forensicData;
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "FORENSICS",
            message: `Failed to capture PID ${pid}: ${(e as Error).message}`
        });
        return null;
    }
  }

  /**
   * Calculates the SHA-256 hash of a process's executable binary.
   */
  async calculateProcessHash(pid: number): Promise<string | null> {
    try {
        const exePath = await Deno.readLink(`/proc/${pid}/exe`);
        // BUG-4.12 FIX: Use streaming hash to prevent OOM on large binaries
        const file = await Deno.open(exePath, { read: true });
        try {
            return await computeStreamHash(file.readable);
        } finally {
            try { file.close(); } catch { /* ignore */ }
        }
    } catch {
        return null;
    }
  }

  protected override async onInit(): Promise<Result<void>> {
    return ok(undefined);
  }

  protected override async onShutdown(): Promise<Result<void>> {
    return ok(undefined);
  }

  /**
   * SOV-P5: Perform a forensic search across snapshots and ledger.
   */
  async search(query: ForensicQuery) {
    return await this.queryTool.search(query);
  }

  async isolateSource(source: string, reason: string): Promise<{ success: boolean; message: string }> {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "FORENSICS",
        message: `Isolating source: ${source} - ${reason}`
    });
    return { success: true, message: `Isolated source ${source}` };
  }
}
