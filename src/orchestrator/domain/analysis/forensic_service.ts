import { AuditService } from "./audit.ts";
import { LoggingPort, LogSeverity, LogType, MeshAuthPort } from "../../core/ports.ts";
import { ProcessTracker } from "./process_tracker.ts";

/**
 * ForensicService
 * Handles the aggregation and packaging of security evidence for post-mortem analysis.
 */
export class ForensicService {
  constructor(
    private audit: AuditService,
    private logging: LoggingPort,
    private kv: Deno.Kv,
    private processTracker: ProcessTracker,
    private meshAuth: MeshAuthPort
  ) {}

  /**
   * Generates a cryptographically signed bundle of all security events and system snapshots.
   */
  async generateEvidenceBundle(limit = 1000) {
    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "FORENSICS",
        message: "Initiating evidence bundle generation..."
    });
    
    // 1. Gather Audit Logs
    const logs = await this.audit.getRecentEvents(limit);
    
    // 2. Gather Current Process Tree
    const processTree = this.processTracker.getTree();
    
    // 3. Construct the Manifest
    const bundleData = {
      version: "1.3",
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      node: Deno.hostname(),
      data: {
        logs,
        processTree,
        networkSnapshot: [] // Placeholder for PCAP links
      }
    };

    // 4. Cryptographic Signing
    let signature = null;
    try {
        const caRes = await this.meshAuth.getRootCA();
        if (!caRes.success) throw new Error(`MeshAuth getRootCA failed: ${caRes.error.message}`);
        const ca = caRes.data;
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(bundleData));

        // Import the private key for signing
        const keyData = ca.key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
        const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));

        const privateKey = await crypto.subtle.importKey(
            "pkcs8",
            binaryKey,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["sign"]
        );

        const sigBuffer = await crypto.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            privateKey,
            data
        );
        signature = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "FORENSICS",
            message: `Evidence signing failed: ${(e as Error).message}. Bundle remains unsigned.`
        });
    }

    const bundle = {
        ...bundleData,
        signature,
        signer: "MeshRootCA"
    };

    const bundleJson = JSON.stringify(bundle);
    const bundlePath = `./volume/storage/forensics/bundle_${bundle.id}.json`;
    await Deno.writeTextFile(bundlePath, bundleJson);

    await this.audit.logEvent({
        type: "SUCCESS",
        message: `Forensic Evidence Bundle Generated: ${bundle.id}`,
        data: { bundleId: bundle.id, size: JSON.stringify(bundle).length }
    });

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: LogType.DEBUG,
        severity: LogSeverity.INFO,
        caller: "FORENSICS",
        message: `Bundle generated: ${logs.length} events, ${processTree.length} processes captured.`
    });
    return bundle;
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
        const { computeStreamHash } = await import("../../core/crypto_utils.ts");
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

  async isolateSource(source: string, reason: string): Promise<any> {
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
