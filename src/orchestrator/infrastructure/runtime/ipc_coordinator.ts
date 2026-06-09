import { LoggingPort, LogSeverity, LogType, CommandResult } from "@core/ports.ts";
import { IpcFfiBridge } from "./ipc_ffi_bridge.ts";
import { SidecarResponse } from "../system/validation.ts";

export class IpcCoordinator {
    private mappedShmem: Map<string, Deno.PointerValue> = new Map();
    private shmemPaths: Map<string, string[]> = new Map();
    private mappedCmdShmem: Map<string, Deno.PointerValue> = new Map();
    private responseWaiters: Map<string, Map<string, { resolve: (data: CommandResult) => void, reject: (err: Error) => void }>> = new Map();
    private eventHandlers: Map<string, ((data: SidecarResponse) => void)[]> = new Map();

    constructor(
        private logging: LoggingPort,
        private ffi: IpcFfiBridge
    ) {}

    async setupSharedMemory(name: string, pid: number) {
        if (name === "sentinel" || name === "netcap") {
            const shmemPath = `/dev/shm/cts_${name}_${pid}`;
            const cmdShmemPath = `/dev/shm/cts_cmd_${name}_${pid}`;

            // Record paths for aggressive cleanup
            if (!this.shmemPaths.has(name)) this.shmemPaths.set(name, []);
            this.shmemPaths.get(name)!.push(shmemPath, cmdShmemPath);

            // SOV-05 STABILITY: Adaptive retry for shmem segment readiness
            let attempts = 0;
            const maxAttempts = 20;
            while (attempts < maxAttempts) {
                try {
                    await Deno.stat(shmemPath);
                    await Deno.stat(cmdShmemPath);
                    break;
                } catch {
                    attempts++;
                    await new Promise(r => setTimeout(r, 50));
                }
            }

            const shmemPtr = this.ffi.createShmem(shmemPath, 1024 * 1024);
            const cmdShmemPtr = this.ffi.createShmem(cmdShmemPath, 64 * 1024);

            // SEC-06 Hardening: Enforce strict 0600 permissions on all IPC segments (Audit 15.2)
            // Prevents unprivileged local users from sniffing security telemetry in /dev/shm
            try {
                await Deno.chmod(shmemPath, 0o600);
                await Deno.chmod(cmdShmemPath, 0o600);
            } catch { /* ignore if shmem is already root-owned or inaccessible */ }

            if (shmemPtr) this.mappedShmem.set(name, shmemPtr);
            if (cmdShmemPtr) this.mappedCmdShmem.set(name, cmdShmemPtr);
        }
    }

    getShmemPtr(name: string): Deno.PointerValue | undefined {
        return this.mappedShmem.get(name);
    }

    getCmdShmemPtr(name: string): Deno.PointerValue | undefined {
        return this.mappedCmdShmem.get(name);
    }

    async clearMappings(name: string) {
        this.mappedShmem.delete(name);
        this.mappedCmdShmem.delete(name);

        const paths = this.shmemPaths.get(name);
        if (paths) {
            for (const p of paths) {
                try {
                    // SOV-06 HARDENING: Force remove shared memory segments to prevent leaks
                    // We check for existence first to avoid noise, but try/catch protects against race conditions.
                    const stats = await Deno.stat(p).catch(() => null);
                    if (stats) {
                        await Deno.remove(p);
                        this.logging.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.DEBUG,
                            severity: LogSeverity.INFO,
                            caller: "orchestrator:infra:runtime:ipc_coordinator",
                            message: `Unlinked shared memory segment: ${p}`
                        }).catch(() => {});
                    }
                } catch (e) {
                    // SOV-06: Log failure to cleanup but don't block
                    this.logging.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.DEBUG,
                        severity: LogSeverity.WARNING,
                        caller: "orchestrator:infra:runtime:ipc_coordinator",
                        message: `Failed to unlink shmem segment ${p}: ${(e as Error).message}`
                    }).catch(() => {});
                }
            }
            this.shmemPaths.delete(name);
        }
    }

    async shutdown() {
        const names = Array.from(this.shmemPaths.keys());
        for (const name of names) {
            await this.clearMappings(name);
        }
    }

    addWaiter(name: string, id: string, waiter: { resolve: (data: CommandResult) => void, reject: (err: Error) => void }) {
        if (!this.responseWaiters.has(name)) this.responseWaiters.set(name, new Map());
        this.responseWaiters.get(name)!.set(id, waiter);
    }

    getWaiter(name: string, id: string) {
        return this.responseWaiters.get(name)?.get(id);
    }

    removeWaiter(name: string, id: string) {
        this.responseWaiters.get(name)?.delete(id);
    }

    onEvent(name: string, handler: (data: SidecarResponse) => void) {
        if (!this.eventHandlers.has(name)) this.eventHandlers.set(name, []);
        this.eventHandlers.get(name)!.push(handler);
    }

    emitEvent(name: string, data: SidecarResponse) {
        const handlers = this.eventHandlers.get(name) || [];
        for (const handler of handlers) {
            handler(data);
        }
    }
}
