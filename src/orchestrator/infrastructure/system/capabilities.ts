/**
 * Linux Capability Management via FFI
 * Allows the Orchestrator to drop its own capabilities for Principle of Least Privilege.
 */

const PR_CAPBSET_DROP = 24;

// Load libc for prctl
const lib = Deno.dlopen("libc.so.6", {
  "prctl": {
    parameters: ["i32", "u64", "u64", "u64", "u64"],
    result: "i32",
  },
});

/**
 * List of capabilities to KEEP.
 * CAP_NET_RAW (13), CAP_SYS_ADMIN (21), CAP_CHOWN (0), CAP_FOWNER (3), CAP_SETCAP (31)
 */
const CAPS_TO_KEEP = [0, 3, 13, 21, 31];

/**
 * SOV-M7: Dynamic capability discovery and pruning (Audit 7.2).
 */
export function dropUnnecessaryCapabilities(): boolean {
    if (Deno.build.os !== "linux") return true;

    let lastCap = 40; // Fallback
    try {
        const content = Deno.readTextFileSync("/proc/sys/kernel/cap_last_cap");
        lastCap = parseInt(content.trim(), 10);
    } catch {
        // Fallback to 40 if procfs unavailable
    }

    let success = true;
    for (let cap = 0; cap <= lastCap; cap++) {
        if (CAPS_TO_KEEP.includes(cap)) continue;

        try {
            const res = lib.symbols.prctl(PR_CAPBSET_DROP, BigInt(cap), 0n, 0n, 0n);
            if (res !== 0) {
                // Some caps might already be dropped or not supported by the kernel
            }
        } catch {
            success = false;
        }
    }
    return success;
}

/**
 * Returns the current cap_last_cap for testing purposes.
 */
export function getLastCap(): number {
    try {
        const content = Deno.readTextFileSync("/proc/sys/kernel/cap_last_cap");
        return parseInt(content.trim(), 10);
    } catch {
        return 40;
    }
}
