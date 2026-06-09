import { assertEquals } from "@std/assert";
import { ForensicArtifactLifecycleManager } from "../src/orchestrator/domain/analysis/forensic_lifecycle.ts";
import { LogEntry, LoggingPort } from "@core/ports.ts";

class MockLoggingPort implements LoggingPort {
    logs: LogEntry[] = [];
    enableGlobalIntercept(): void {}
    async log(entry: LogEntry): Promise<void> { this.logs.push(entry); }
    async getRecentLogs(_limit?: number): Promise<LogEntry[]> { return this.logs; }
    async logLegacy(_message: string, _severity?: any, _source?: string, _payload?: any): Promise<void> {}
    setKv(_kv: any): void {}
    async shutdown(): Promise<void> {}
}

/**
 * Forensic Quota Stress Test
 * Verifies that the disk quota is strictly enforced under load.
 */
Deno.test("Forensic Lifecycle - Global Disk Quota Enforcement", async () => {
    const logger = new MockLoggingPort();
    const config = {
        getNumber: (key: string, def: number) => key === "FORENSIC_DISK_QUOTA_MB" ? 10 : def, // 10MB quota for test
        getEnv: (k: string) => undefined
    };

    const manager = new ForensicArtifactLifecycleManager(logger, config as any);
    const storageDir = "./volume/storage/forensics";

    // 1. Prepare: Ensure clean directory
    try { await Deno.remove(storageDir, { recursive: true }); } catch { /* ignore */ }
    await Deno.mkdir(storageDir, { recursive: true });

    // 2. Stress: Create 15 files of 1MB each (Total 15MB, exceeding 10MB quota)
    const data = new Uint8Array(1024 * 1024); // 1MB
    for (let i = 0; i < 15; i++) {
        const path = `${storageDir}/alert_${i}.pcap`;
        await Deno.writeFile(path, data);
        // Small sleep to ensure different mtimes
        await new Promise(r => setTimeout(r, 10));
    }

    // 3. Enforce
    await manager.enforceQuota();

    // 4. Verify: Total size should be <= 8MB (80% of 10MB)
    let totalSize = 0;
    let fileCount = 0;
    for await (const entry of Deno.readDir(storageDir)) {
        if (entry.isFile) {
            const info = await Deno.stat(`${storageDir}/${entry.name}`);
            totalSize += info.size;
            fileCount++;
        }
    }

    const quotaBytes = 10 * 1024 * 1024;
    assertEquals(totalSize <= (quotaBytes * 0.8), true, `Total size ${totalSize} should be <= 80% of quota (${quotaBytes * 0.8})`);
    assertEquals(fileCount < 15, true, "Old files should have been purged");

    // 5. Verify: Correct log was emitted
    assertEquals(logger.logs.some(l => l.message.includes("Quota exceeded")), true);

    // Cleanup
    try { await Deno.remove(storageDir, { recursive: true }); } catch { /* ignore */ }
});
