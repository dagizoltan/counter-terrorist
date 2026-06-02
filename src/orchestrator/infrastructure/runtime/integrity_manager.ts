import { LoggingPort, LogSeverity, LogType, ConfigurationPort, ExecutorPort } from "@core/ports.ts";
import { SidecarManifest } from "./sidecar_repository.ts";
import { IpcFfiBridge } from "./ipc_ffi_bridge.ts";

export class IntegrityManager {
    constructor(
        private logging: LoggingPort,
        private executor: ExecutorPort,
        private ffi: IpcFfiBridge
    ) {}

    async verifyAndHeal(name: string, binPath: string, manifest: SidecarManifest | null, config: ConfigurationPort, force: boolean = false): Promise<boolean> {
        const currentHash = await this.calculateHash(binPath);
        if (!currentHash && !force) return false;

        const isProduction = config.getEnv("ENVIRONMENT") === "production";
        const isDevMode = config.getBoolean("CTS_DEV_MODE", false);
        const arch = Deno.build.arch;
        const manifestHash = manifest?.sidecars?.[name]?.architectures[arch]?.hash;
        const envHash = config.getEnv(`CTS_HASH_${name.toUpperCase()}`);
        const goldenHash = isProduction ? manifestHash : (manifestHash || envHash);

        if (isProduction && !manifestHash) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:runtime:integrity_manager",
                message: `CRITICAL: No manifest entry for ${name} in production.`
            });
            return false;
        }

        if (!force && (!goldenHash || currentHash === goldenHash)) {
            return true;
        }

        await this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:infra:runtime:integrity_manager",
            message: `Integrity Mismatch for ${name}! Attempting healing...`
        });

        return await this.healFromGolden(name, binPath, goldenHash);
    }

    private async healFromGolden(name: string, binPath: string, goldenHash?: string): Promise<boolean> {
        try {
            const goldenRepo = `./volume/storage/agents/golden/${name}`;
            const goldenStat = await Deno.stat(goldenRepo).catch(() => null);

            if (goldenStat?.isFile) {
                await this.executor.execute("cp", ["-p", goldenRepo, binPath]);
                const healedHash = await this.calculateHash(binPath);

                if (healedHash === goldenHash) {
                    await this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.AUDIT,
                        severity: LogSeverity.SUCCESS,
                        caller: "orchestrator:infra:runtime:integrity_manager",
                        message: `Successfully healed sidecar ${name}.`
                    });
                    return true;
                }
            }
        } catch (e) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:infra:runtime:integrity_manager",
                message: `Healing failed for ${name}: ${(e as Error).message}`
            });
        }
        return false;
    }

    private async calculateHash(path: string): Promise<string | null> {
        const ffiHash = this.ffi.calculateHash(path);
        if (ffiHash) return ffiHash;

        try {
            const res = await this.executor.execute("sha256sum", [path]);
            if (res.success && res.stdout) {
                return res.stdout.split(" ")[0].trim();
            }
        } catch (e) {
            await this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.DEBUG,
                caller: "orchestrator:infra:runtime:integrity_manager",
                message: `Hash calculation failed for ${path}: ${(e as Error).message}`
            });
        }
        return null;
    }
}
