import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { IpcFfiBridge } from "./ipc_ffi_bridge.ts";
import { SidecarResponse } from "../system/validation.ts";

export class IpcCoordinator {
    private mappedShmem: Map<string, Deno.PointerValue> = new Map();
    private mappedCmdShmem: Map<string, Deno.PointerValue> = new Map();

    constructor(
        private logging: LoggingPort,
        private ffi: IpcFfiBridge
    ) {}

    async setupSharedMemory(name: string, pid: number) {
        if (name === "sentinel" || name === "netcap") {
            const shmemPath = `/dev/shm/cts_${name}_${pid}`;
            const cmdShmemPath = `/dev/shm/cts_cmd_${name}_${pid}`;
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

    clearMappings(name: string) {
        this.mappedShmem.delete(name);
        this.mappedCmdShmem.delete(name);
    }
}
