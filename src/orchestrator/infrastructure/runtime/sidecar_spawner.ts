import { LoggingPort, LogSeverity, LogType, ConfigurationPort, ExecutorPort } from "@core/ports.ts";
import { SIDECAR_REGISTRY } from "./sidecar_registry.ts";

export class SidecarSpawner {
    constructor(
        private logging: LoggingPort,
        private executor: ExecutorPort
    ) {}

    async spawn(name: string, binPath: string, env: Record<string, string>, config: ConfigurationPort): Promise<Deno.ChildProcess> {
        const isDev = config.getBoolean("CTS_DEV_MODE", false);
        let execPath = binPath;

        if (!isDev) {
            const caps = SIDECAR_REGISTRY[name]?.capabilities || "";
            const res = await this.executor.execute("/var/lib/cts/scripts/secure_spawn.sh", [name, binPath, caps, "none"]);
            if (res.success) {
                execPath = `/var/lib/cts/bin/${name}`;
            }
        }

        const isLinux = Deno.build.os === "linux";
        let finalExec = execPath;
        let finalArgs: string[] = [];

        if (isLinux && Deno.uid() === 0) {
            finalExec = "systemd-run";
            finalArgs = [
                "--scope",
                "--quiet",
                "-p", "CPUQuota=25%",
                "-p", "MemoryMax=512M",
                "-p", "MemorySwapMax=0",
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
}
