import { LoggingPort, LogSeverity, LogType, ConfigurationPort, ExecutorPort } from "@core/ports.ts";
import { SIDECAR_REGISTRY } from "./sidecar_registry.ts";

export class SidecarSpawner {
    private restartCounts: Map<string, { count: number, lastRestart: number }> = new Map();
    private unsupportedSidecars: Set<string> = new Set();
    private trippedSidecars: Set<string> = new Set();
    private spawningPromises: Map<string, Promise<Deno.ChildProcess | null>> = new Map();

    constructor(
        private logging: LoggingPort,
        private executor: ExecutorPort
    ) {}

    async spawn(name: string, binPath: string, env: Record<string, string>, config: ConfigurationPort): Promise<Deno.ChildProcess> {
        // SEC-06 Hardening: Ensure binary exists and is executable before attempting spawn
        try {
            const stat = await Deno.stat(binPath);
            if (!stat.isFile) throw new Error(`Not a file: ${binPath}`);
            // Check for execution bit on Unix
            if (Deno.build.os !== "windows" && stat.mode) {
                if (!(stat.mode & 0o111)) {
                    throw new Error(`Binary not executable: ${binPath}`);
                }
            }
        } catch (e) {
            throw new Error(`Pre-spawn validation failed for ${name} at ${binPath}: ${e instanceof Error ? e.message : String(e)}`);
        }

        const isDev = config.getBoolean("CTS_DEV_MODE", false);
        const isProduction = config.getEnv("ENVIRONMENT") === "production";
        let execPath = binPath;

        if (!isDev) {
            const caps = SIDECAR_REGISTRY[name]?.capabilities || "";
            const res = await this.executor.execute("/var/lib/cts/scripts/secure_spawn.sh", [name, binPath, caps, "none"]);
            if (res.success) {
                execPath = `/var/lib/cts/bin/${name}`;
            } else {
                await this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: isProduction ? LogSeverity.ERROR : LogSeverity.WARNING,
                    caller: "orchestrator:infra:runtime:sidecar_spawner",
                    message: `Secure spawn failed for ${name}. Falling back to insecure path.`
                });
                if (isProduction) throw new Error(`Security Violation: Secure spawn failed for ${name} in production.`);
            }
        }

        const isLinux = Deno.build.os === "linux";
        let finalExec = execPath;
        let finalArgs: string[] = [];

        if (isLinux && Deno.uid() === 0) {
            const sidecarConfig = SIDECAR_REGISTRY[name];
            const cpuQuota = sidecarConfig?.resources?.cpu || "25%";
            const memoryMax = sidecarConfig?.resources?.memory || "512M";

            finalExec = "systemd-run";
            finalArgs = [
                "--scope",
                "--quiet",
                "-p", `CPUQuota=${cpuQuota}`,
                "-p", `MemoryMax=${memoryMax}`,
                "-p", "MemorySwapMax=0",
                "-p", "TasksMax=100",
                execPath
            ];
        }

        const command = new Deno.Command(finalExec, {
            args: finalArgs,
            stdin: "piped",
            stdout: "piped",
            stderr: "piped",
            env
        });

        return command.spawn();
    }

    isUnsupported(name: string): boolean {
        return this.unsupportedSidecars.has(name);
    }

    markUnsupported(name: string) {
        this.unsupportedSidecars.add(name);
    }

    isTripped(name: string): boolean {
        return this.trippedSidecars.has(name);
    }

    markTripped(name: string) {
        this.trippedSidecars.add(name);
    }

    clearTripped(name: string) {
        this.trippedSidecars.delete(name);
    }

    getRestartInfo(name: string) {
        return this.restartCounts.get(name) || { count: 0, lastRestart: 0 };
    }

    setRestartInfo(name: string, info: { count: number, lastRestart: number }) {
        this.restartCounts.set(name, info);
    }

    clearRestartInfo(name: string) {
        this.restartCounts.delete(name);
    }

    getSpawningPromise(name: string) {
        return this.spawningPromises.get(name);
    }

    setSpawningPromise(name: string, promise: Promise<Deno.ChildProcess | null>) {
        this.spawningPromises.set(name, promise);
    }

    clearSpawningPromise(name: string) {
        this.spawningPromises.delete(name);
    }

    getTrippedSidecars(): string[] {
        return Array.from(this.trippedSidecars);
    }
}
