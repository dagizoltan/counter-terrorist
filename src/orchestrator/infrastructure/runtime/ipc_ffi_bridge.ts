import { LogType, LogSeverity, LoggingPort } from "@core/ports.ts";

export class IpcFfiBridge {
    private ffi: Deno.DynamicLibrary<typeof IpcFfiBridge.SYMBOLS> | null;

    static readonly SYMBOLS = {
        "hash_file_sha256": { parameters: ["buffer", "buffer"], result: "i32" },
        "create_shmem": { parameters: ["buffer", "usize"], result: "pointer" },
        "serialize_msgpack": { parameters: ["buffer", "pointer"], result: "pointer" },
        "fast_serialize_msgpack": { parameters: ["buffer", "pointer"], result: "pointer" },
        "deserialize_msgpack": { parameters: ["buffer", "usize"], result: "pointer" },
        "create_sealed_memfd": { parameters: ["buffer", "buffer", "usize"], result: "i32" },
        "free_buffer": { parameters: ["pointer", "usize"], result: "void" },
        "free_string": { parameters: ["pointer"], result: "void" },
        "shmem_read": { parameters: ["pointer", "buffer", "usize"], result: "i32" },
        "shmem_write": { parameters: ["pointer", "buffer", "usize"], result: "bool" },
        "shmem_ring_pull": { parameters: ["pointer", "pointer"], result: "pointer" },
        "shmem_ring_commit": { parameters: ["pointer"], result: "void" },
        "fast_morph": { parameters: ["buffer", "usize", "buffer", "usize"], result: "void" },
        "verify_ed25519": { parameters: ["buffer", "buffer", "buffer", "usize"], result: "bool" }
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
        const ptr = this.ffi.symbols.create_shmem(pathBuf, BigInt(size));
        return ptr || null;
    }

    readShmem(ptr: Deno.PointerValue, size: number = 65536, obfuscationKey?: Uint8Array): string | null {
        if (!this.ffi) return null;
        const outBuf = new Uint8Array(size);
        const readLen = Number(this.ffi.symbols.shmem_read(ptr, outBuf, BigInt(outBuf.length)));
        if (readLen <= 0) return null;

        // SEC-03: Shared Memory IPC Hardening - SIMD-accelerated Obfuscation
        if (obfuscationKey && obfuscationKey.length > 0) {
            this.fastMorph(outBuf.subarray(0, readLen), obfuscationKey);
        }

        const jsonPtr = this.ffi.symbols.deserialize_msgpack(outBuf, BigInt(readLen));
        if (jsonPtr) {
            const jsonStr = Deno.UnsafePointerView.getCString(jsonPtr);
            this.ffi.symbols.free_string(jsonPtr);
            return jsonStr;
        }
        return null;
    }

    /**
     * SOV-M4: Zero-Copy Ring Buffer Pull
     */
    pullRingEvent(ptr: Deno.PointerValue, obfuscationKey?: Uint8Array, agentPublicKey?: Uint8Array): string | null {
        if (!this.ffi || !ptr) return null;
        const outLenPtr = new Uint32Array(1);
        const msgPtr = this.ffi.symbols.shmem_ring_pull(ptr, Deno.UnsafePointer.of(outLenPtr));

        if (!msgPtr) return null;

        let len = outLenPtr[0];
        if (len === 0) return null;

        // Create a view directly into shared memory (Zero-Copy)
        let view = new Uint8Array(Deno.UnsafePointerView.getArrayBuffer(msgPtr, len));

        // SEC-03: Shared Memory IPC Hardening - SIMD-accelerated Obfuscation
        if (obfuscationKey && obfuscationKey.length > 0) {
            this.fastMorph(view, obfuscationKey);
        }

        // SOV-P5: Telemetry Signing Verification
        // If we have a public key for this agent, verify the 64-byte signature prepended to the message.
        if (agentPublicKey && agentPublicKey.length === 32 && len > 64) {
            const signature = view.slice(0, 64);
            const payload = view.slice(64);

            const isAuthentic = this.ffi.symbols.verify_ed25519(
                agentPublicKey,
                signature,
                payload,
                BigInt(payload.length)
            );

            if (!isAuthentic) {
                this.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.CRITICAL,
                    caller: "orchestrator:infra:runtime:ipc_ffi_bridge",
                    message: "SECURITY VIOLATION: Invalid telemetry signature detected in shared memory! Rejecting spoofed event."
                }).catch(() => {});
                this.ffi.symbols.shmem_ring_commit(ptr);
                return null;
            }

            // Advance view/len to skip signature for deserialization
            view = payload;
            len -= 64;
        }

        const jsonPtr = this.ffi.symbols.deserialize_msgpack(view, BigInt(len));
        if (jsonPtr) {
            const jsonStr = Deno.UnsafePointerView.getCString(jsonPtr);
            this.ffi.symbols.free_string(jsonPtr);

            // Commit only after successful deserialization
            this.ffi.symbols.shmem_ring_commit(ptr);
            return jsonStr;
        }

        return null;
    }

    writeShmem(ptr: Deno.PointerValue, data: Uint8Array, obfuscationKey?: Uint8Array): boolean {
        if (!this.ffi || !ptr) return false;

        // SEC-03: Shared Memory IPC Hardening - SIMD-accelerated Obfuscation
        if (obfuscationKey && obfuscationKey.length > 0) {
            const masked = new Uint8Array(data);
            this.fastMorph(masked, obfuscationKey);
            return this.ffi.symbols.shmem_write(ptr, masked, BigInt(masked.length));
        }

        return this.ffi.symbols.shmem_write(ptr, data, BigInt(data.length));
    }

    fastMorph(data: Uint8Array, key: Uint8Array): void {
        if (!this.ffi) return;
        this.ffi.symbols.fast_morph(data, BigInt(data.length), key, BigInt(key.length));
    }

    createSealedMemfd(name: string, data: Uint8Array): number {
        if (!this.ffi) return -1;
        const nameBuf = new TextEncoder().encode(name + "\0");
        // Convert potentially SharedArrayBuffer-backed Uint8Array to regular Uint8Array for FFI compatibility
        const buffer = new Uint8Array(data);
        return this.ffi.symbols.create_sealed_memfd(nameBuf, buffer, BigInt(buffer.length));
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
