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
 * List of capabilities to drop.
 * We drop everything EXCEPT what's strictly needed for management:
 * CAP_NET_RAW (13), CAP_SYS_ADMIN (21), CAP_CHOWN (0), CAP_FOWNER (3), CAP_SETCAP (31)
 */
const CAPS_TO_DROP = [
    1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 37, 38, 39, 40
];

export function dropUnnecessaryCapabilities(): boolean {
    if (Deno.build.os !== "linux") return true;

    let success = true;
    for (const cap of CAPS_TO_DROP) {
        try {
            const res = lib.symbols.prctl(PR_CAPBSET_DROP, BigInt(cap), 0n, 0n, 0n);
            if (res !== 0) {
                // Some caps might already be dropped or not supported by the kernel
                // We log only real errors if needed
            }
        } catch {
            success = false;
        }
    }
    return success;
}
