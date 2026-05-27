import { LogType, LogSeverity, LoggingPort } from "@core/ports.ts";

export class IpcFfiBridge {
    private ffi: any;

    constructor(private logging: LoggingPort) {
        this.ffi = this.loadFfi();
    }

    private loadFfi() {
        try {
            const isLinux = Deno.build.os === "linux";
            const suffix = isLinux ? "so" : "dylib";
            const libPath = `./src/agents/target/release/libcts_sec.${suffix}`;
            return Deno.dlopen(libPath, {
                "hash_file_sha256": { parameters: ["buffer", "buffer"], result: "i32" },
                "create_shmem": { parameters: ["buffer", "usize"], result: "pointer" },
                "serialize_msgpack": { parameters: ["buffer", "pointer"], result: "pointer" },
                "deserialize_msgpack": { parameters: ["buffer", "usize"], result: "pointer" },
                "free_buffer": { parameters: ["pointer", "usize"], result: "void" },
                "free_string": { parameters: ["pointer"], result: "void" },
                "shmem_read": { parameters: ["pointer", "buffer", "usize"], result: "i32" }
            });
        } catch {
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
        return this.ffi.symbols.create_shmem(pathBuf, size);
    }

    readShmem(ptr: Deno.PointerValue, size: number = 65536): string | null {
        if (!this.ffi) return null;
        const outBuf = new Uint8Array(size);
        const readLen = this.ffi.symbols.shmem_read(ptr, outBuf, outBuf.length);
        if (readLen <= 0) return null;

        const jsonPtr = this.ffi.symbols.deserialize_msgpack(outBuf, readLen);
        if (jsonPtr) {
            const jsonStr = Deno.UnsafePointerView.getCString(jsonPtr);
            this.ffi.symbols.free_string(jsonPtr);
            return jsonStr;
        }
        return null;
    }

    serializeMessagePack(cmd: Record<string, unknown>): Uint8Array | null {
        if (!this.ffi) return null;
        const jsonStr = JSON.stringify(cmd) + "\0";
        const jsonBuf = new TextEncoder().encode(jsonStr);
        const outLenPtr = new BigUint64Array(1);
        const msgpackPtr = this.ffi.symbols.serialize_msgpack(jsonBuf, Deno.UnsafePointer.of(outLenPtr));

        if (!msgpackPtr) return null;

        const len = Number(outLenPtr[0]);
        const view = new Uint8Array(Deno.UnsafePointerView.getArrayBuffer(msgpackPtr, len));
        const result = new Uint8Array(view); // Copy

        this.ffi.symbols.free_buffer(msgpackPtr, len);
        return result;
    }

    deserializeMessagePack(payload: Uint8Array): string | null {
        if (!this.ffi) return null;
        const jsonPtr = this.ffi.symbols.deserialize_msgpack(payload, payload.length);
        if (jsonPtr) {
            const jsonStr = Deno.UnsafePointerView.getCString(jsonPtr);
            this.ffi.symbols.free_string(jsonPtr);
            return jsonStr;
        }
        return null;
    }
}
