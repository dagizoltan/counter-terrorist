import { LoggingPort, LogSeverity, LogType, ConfigurationPort } from "../../core/ports.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "@core/result.ts";

/**
 * ForensicArtifactLifecycleManager
 * Audit 10.3: Enforce global disk quotas for PCAP/dumps.
 * Manages the lifecycle of forensic artifacts on disk.
 */
export class ForensicArtifactLifecycleManager extends BaseService {
    private storageDir = "./volume/storage/forensics";
    private quotaIntervalId?: ReturnType<typeof setInterval>;

    constructor(private logging: LoggingPort, private config: ConfigurationPort) {
        super();
    }

    protected override async onInit(): Promise<Result<void>> {
        await this.enforceQuota();
        // Periodically enforce quota every hour
        this.quotaIntervalId = setInterval(() => this.enforceQuota(), 60 * 60 * 1000);
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        if (this.quotaIntervalId) {
            clearInterval(this.quotaIntervalId);
            this.quotaIntervalId = undefined;
        }
        return ok(undefined);
    }

    /**
     * Enforces the global disk quota by purging oldest artifacts.
     */
    async enforceQuota() {
        try {
            await Deno.mkdir(this.storageDir, { recursive: true });
            const quotaMb = this.config.getNumber("FORENSIC_DISK_QUOTA_MB", 500);
            const quotaBytes = quotaMb * 1024 * 1024;
            const files: { path: string; size: number; mtime: number }[] = [];
            let totalSize = 0;

            for await (const entry of Deno.readDir(this.storageDir)) {
                if (entry.isFile) {
                    const path = `${this.storageDir}/${entry.name}`;
                    const info = await Deno.stat(path);
                    files.push({ path, size: info.size, mtime: info.mtime?.getTime() || 0 });
                    totalSize += info.size;
                }
            }

            if (totalSize > quotaBytes) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.WARNING,
                    caller: "FORENSICS:QUOTA",
                    message: `Quota exceeded (${(totalSize / 1024 / 1024).toFixed(2)}MB > ${quotaMb}MB). Purging old artifacts...`
                });

                // Sort by mtime ascending (oldest first)
                files.sort((a, b) => a.mtime - b.mtime);

                for (const file of files) {
                    await Deno.remove(file.path);
                    totalSize -= file.size;
                    if (totalSize <= quotaBytes * 0.8) break; // Purge until 80% capacity
                }
            }
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "FORENSICS:QUOTA",
                message: `Quota enforcement failed: ${(e as Error).message}`
            });
        }
    }
}
