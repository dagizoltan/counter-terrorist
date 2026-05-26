import { SidecarManager } from "../../infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "../../infrastructure/system/system_executor.ts";
import { LoggingPort, LogSeverity } from "../../core/ports.ts";

class MockLogging implements LoggingPort {
    enableGlobalIntercept(): void {}
    async log(entry: any) {
        if (entry.severity === LogSeverity.ERROR || entry.message.includes("Dropping")) {
            console.log(`[FUZZER DETECTED] ${entry.message}`);
        }
    }
    async getRecentLogs() { return []; }
    async logLegacy() {}
    setKv() {}
    async shutdown() {}
}

const executor = new SystemExecutor({ log: () => {} } as any);
const manager = new SidecarManager(executor, new MockLogging());

console.log("Starting IPC Fuzzing Test...");

async function fuzzRecursion() {
    console.log("Testing Deeply Nested JSON...");
    const deepJson = "{\"a\":".repeat(20) + "1" + "}".repeat(20);
    // @ts-ignore: private method
    await (manager as any).startResponseReader("analyzer", {
        stdout: {
            getReader: () => {
                let sent = false;
                return {
                    read: async () => {
                        if (sent) return { done: true };
                        sent = true;
                        return { done: false, value: new TextEncoder().encode(deepJson + "\n") };
                    },
                    releaseLock: () => {}
                };
            }
        },
        stderr: { getReader: () => ({ read: async () => ({ done: true }), releaseLock: () => {} }) },
        status: Promise.resolve({ code: 0 }),
        kill: () => {}
    } as any);
}

async function fuzzFalsePositives() {
    console.log("Testing Brackets in Strings (False Positive Prevention)...");
    const fpJson = "{\"message\": \"[[[[[[[[[[{{{{{{{{{{\" }";
    // @ts-ignore: private method
    await (manager as any).startResponseReader("analyzer", {
        stdout: {
            getReader: () => {
                let sent = false;
                return {
                    read: async () => {
                        if (sent) return { done: true };
                        sent = true;
                        return { done: false, value: new TextEncoder().encode(fpJson + "\n") };
                    },
                    releaseLock: () => {}
                };
            }
        },
        stderr: { getReader: () => ({ read: async () => ({ done: true }), releaseLock: () => {} }) },
        status: Promise.resolve({ code: 0 }),
        kill: () => {}
    } as any);
}

async function fuzzOversized() {
    console.log("Testing Oversized IPC Line...");
    const bigLine = "A".repeat(2 * 1024 * 1024); // 2MB
    // @ts-ignore: private method
    await (manager as any).startResponseReader("analyzer", {
        stdout: {
            getReader: () => {
                let sent = false;
                return {
                    read: async () => {
                        if (sent) return { done: true };
                        sent = true;
                        return { done: false, value: new TextEncoder().encode(bigLine + "\n") };
                    },
                    releaseLock: () => {}
                };
            }
        },
        stderr: { getReader: () => ({ read: async () => ({ done: true }), releaseLock: () => {} }) },
        status: Promise.resolve({ code: 0 }),
        kill: () => {}
    } as any);
}

(async () => {
    try {
        await fuzzRecursion();
        await fuzzFalsePositives();
        await fuzzOversized();
        console.log("Fuzzing test completed.");
        Deno.exit(0);
    } catch (e) {
        console.error("Fuzzer crashed:", e);
        Deno.exit(1);
    }
})();
