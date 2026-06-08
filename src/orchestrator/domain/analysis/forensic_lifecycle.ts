import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "../../core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";

/**
 * ForensicArtifactLifecycleManager
 * Enforces global disk quotas for forensic artifacts (bundles, dumps, PCAPs).
 */
export class ForensicArtifactLifecycleManager extends BaseService {
    private cleanupInterval: number | null = null;
    private storageDir = "./volume/storage/forensics";

    constructor(
        private logging: LoggingPort,
        private config: ConfigurationPort
    ) {
        super();
    }

    protected override async onInit(): Promise<Result<void>> {
        const intervalMs = this.config.getNumber("FORENSIC_CLEANUP_INTERVAL_MS", 3600000); // Default 1 hour
        this.cleanupInterval = setInterval(() => this.cleanup(), intervalMs) as any;

        // Run initial cleanup
        await this.cleanup();
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);
        return ok(undefined);
    }

    /**
     * Scans the forensics directory and purges oldest files if quota is exceeded.
     */
    async cleanup() {
        try {
            // Ensure directory exists
            try {
                await Deno.mkdir(this.storageDir, { recursive: true });
            } catch { /* ignore */ }

            const quotaMb = this.config.getNumber("FORENSIC_DISK_QUOTA_MB", 500);
            const quotaBytes = quotaMb * 1024 * 1024;
            const retentionThreshold = 0.8; // Target 80% usage after cleanup

            const files: { path: string; size: number; mtime: number }[] = [];
            let totalSize = 0;

            for await (const entry of Deno.readDir(this.storageDir)) {
                if (entry.isFile) {
                    const path = `${this.storageDir}/${entry.name}`;
                    const info = await Deno.stat(path);
                    files.push({
                        path,
                        size: info.size,
                        mtime: info.mtime?.getTime() || 0
                    });
                    totalSize += info.size;
                }
            }

            if (totalSize > quotaBytes) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "FORENSICS:LIFECYCLE",
                    message: `Forensic storage quota exceeded (${(totalSize / 1024 / 1024).toFixed(2)}MB > ${quotaMb}MB). Initiating purge...`
                });

                // Sort by mtime ascending (oldest first)
                files.sort((a, b) => a.mtime - b.mtime);

                let deletedCount = 0;
                let deletedSize = 0;
                const targetSize = quotaBytes * retentionThreshold;

                for (const file of files) {
                    await Deno.remove(file.path);
                    deletedCount++;
                    deletedSize += file.size;
                    totalSize -= file.size;

                    if (totalSize <= targetSize) break;
                }

                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.INFO,
                    caller: "FORENSICS:LIFECYCLE",
                    message: `Purged ${deletedCount} old artifacts (${(deletedSize / 1024 / 1024).toFixed(2)}MB freed).`
                });
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "FORENSICS:LIFECYCLE",
                message: `Lifecycle cleanup failed: ${(e as Error).message}`
            });
        }
    }
}
