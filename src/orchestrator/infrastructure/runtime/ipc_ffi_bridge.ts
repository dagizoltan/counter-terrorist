import { LogType, LogSeverity, LoggingPort } from "@core/ports.ts";

export class IpcFfiBridge {
    private ffi: Deno.DynamicLibrary<typeof IpcFfiBridge.SYMBOLS> | null;

    static readonly SYMBOLS = {
        "hash_file_sha256": { parameters: ["buffer", "buffer"], result: "i32" },
        "create_shmem": { parameters: ["buffer", "usize"], result: "pointer" },
        "serialize_msgpack": { parameters: ["buffer", "pointer"], result: "pointer" },
        "fast_serialize_msgpack": { parameters: ["buffer", "pointer"], result: "pointer" },
        "deserialize_msgpack": { parameters: ["buffer", "usize"], result: "pointer" },
        "free_buffer": { parameters: ["pointer", "usize"], result: "void" },
        "free_string": { parameters: ["pointer"], result: "void" },
        "shmem_read": { parameters: ["pointer", "buffer", "usize"], result: "i32" },
        "shmem_write": { parameters: ["pointer", "buffer", "usize"], result: "bool" },
        "fast_morph": { parameters: ["buffer", "usize", "buffer", "usize"], result: "void" }
    } as const;

    constructor(private logging: LoggingPort) {
        this.ffi = this.loadFfi();
    }

    private loadFfi(): Deno.DynamicLibrary<typeof IpcFfiBridge.SYMBOLS> | null {
        try {
            const isLinux = Deno.build.os === "linux";
            const suffix = isLinux ? "so" : "dylib";
            const libPath = `./src/agents/target/release/libcts_sec.${suffix}`;
            return Deno.dlopen(libPath, IpcFfiBridge.SYMBOLS);
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.DEBUG,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:infra:runtime:ipc_ffi_bridge",
                message: `Native FFI (libcts_sec) unavailable: ${(e as Error).message}`
            }).catch(() => console.error("Native FFI unavailable and logging failed"));
            return null;
        }
    }

    calculateHash(path: string): string | null {
        if (!this.ffi) return null;
        const out = new Uint8Array(32);
        const pathEncoded = new TextEncoder().encode(path + "\0");
        const res = this.ffi.symbols.hash_file_sha256(pathEncoded, out);
        if (res === 0) {
            return Array.from(out).map(b => b.toString(16).padStart(2, "0")).join("");
        }
        return null;
    }

    createShmem(path: string, size: number): Deno.PointerValue | null {
        if (!this.ffi) return null;
        const pathBuf = new TextEncoder().encode(path + "\0");
        return this.ffi.symbols.create_shmem(pathBuf, BigInt(size));
    }

    readShmem(ptr: Deno.PointerValue, size: number = 65536): string | null {
        if (!this.ffi) return null;
        const outBuf = new Uint8Array(size);
        const readLen = Number(this.ffi.symbols.shmem_read(ptr, outBuf, BigInt(outBuf.length)));
        if (readLen <= 0) return null;

        const jsonPtr = this.ffi.symbols.deserialize_msgpack(outBuf, BigInt(readLen));
        if (jsonPtr) {
            const jsonStr = Deno.UnsafePointerView.getCString(jsonPtr);
            this.ffi.symbols.free_string(jsonPtr);
            return jsonStr;
        }
        return null;
    }

    writeShmem(ptr: Deno.PointerValue, data: Uint8Array): boolean {
        if (!this.ffi) return false;
        return this.ffi.symbols.shmem_write(ptr, data as any, BigInt(data.length));
    }

    fastMorph(data: Uint8Array, key: Uint8Array): void {
        if (!this.ffi) return;
        this.ffi.symbols.fast_morph(data as any, BigInt(data.length), key as any, BigInt(key.length));
    }

    serializeMessagePack(cmd: Record<string, unknown>): Uint8Array | null {
        if (!this.ffi) return null;
        const jsonStr = JSON.stringify(cmd) + "\0";
        const jsonBuf = new TextEncoder().encode(jsonStr);
        const outLenPtr = new BigUint64Array(1);

        // Performance: Prefer optimized native fast path
        const symbol = this.ffi.symbols.fast_serialize_msgpack || this.ffi.symbols.serialize_msgpack;
        const msgpackPtr = symbol(jsonBuf, Deno.UnsafePointer.of(outLenPtr));

        if (!msgpackPtr) return null;

        const len = Number(outLenPtr[0]);
        const view = new Uint8Array(Deno.UnsafePointerView.getArrayBuffer(msgpackPtr, len));
        const result = new Uint8Array(view); // Copy

        // SEC-05 FIX: Release native buffer to prevent memory leak
        this.ffi.symbols.free_buffer(msgpackPtr, BigInt(len));
        return result;
    }
}
