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

            await new Promise(r => setTimeout(r, 1000));

            const shmemPtr = this.ffi.createShmem(shmemPath, 1024 * 1024);
            const cmdShmemPtr = this.ffi.createShmem(cmdShmemPath, 64 * 1024);

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
                    await Deno.remove(p);
                } catch {
                    // Ignore, file might already be removed by the sidecar or OS
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
