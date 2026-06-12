import { assertEquals } from "@std/assert";
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";
import { SidecarSpawner } from "../src/orchestrator/infrastructure/runtime/sidecar/spawner.ts";
import { LogEntry, LoggingPort } from "@core/ports.ts";
import { IpcFfiBridge } from "../src/orchestrator/infrastructure/runtime/ipc_ffi_bridge.ts";

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
 * Isolation Verification Test
 * Verifies that sidecars are correctly jailed and cannot see host processes.
 */
Deno.test({
    name: "Sidecar Isolation - PID Namespace Verification",
    ignore: Deno.build.os !== "linux" || Deno.uid() !== 0, // Requires root and systemd
    async fn() {
        const executor = new SystemExecutor();
        const logging = new MockLoggingPort();
        const ffi = new IpcFfiBridge(logging);
        const spawner = new SidecarSpawner(logging, executor, ffi);

        // We simulate a config that enables dev mode to use local binaries for the test
        const config = {
            getBoolean: (k: string) => k === "CTS_DEV_MODE",
            getEnv: (k: string) => k === "ENVIRONMENT" ? "test" : undefined
        };

        // Use 'ls' as a dummy agent to check /proc
        // If namespacing works, 'ls /proc' inside the container should only see its own PID and '1'
        const child = await spawner.spawn("analyzer", "/usr/bin/ls", {}, config as any);

        const output = await child.output();
        const stdout = new TextDecoder().decode(output.stdout);

        // Check if orchestrator PID (Deno.pid) is visible in the list
        const pids = stdout.split(/\s+/).filter(p => /^\d+$/.test(p));
        const selfPidVisible = pids.includes(Deno.pid.toString());

        assertEquals(selfPidVisible, false, `Security Violation: Orchestrator PID ${Deno.pid} was visible to sidecar!`);
    }
});
