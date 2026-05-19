/**
 * Subterranean Lure
 * A deceptive process designed to attract rootkits and lateral movers.
 */
console.log("[LURE] Vault Proxy Active. Listening for secure connections...");

// Mock some sensitive-looking activity
setInterval(() => {
  const actions = [
    "Decrypting volume 0x8192...",
    "Rotating secondary master keys...",
    "Heartbeat: OK",
    "Syncing with peer node 'vault-master-01'..."
  ];
  const action = actions[Math.floor(Math.random() * actions.length)];
  // No-op, just to stay in the process list
}, 30000);

// SOV-05 STABILITY: Signal handling for clean exit
const controller = new AbortController();

Deno.addSignalListener("SIGINT", () => {
    console.log("[LURE] SIGINT received. Shutting down...");
    controller.abort();
});

Deno.addSignalListener("SIGTERM", () => {
    console.log("[LURE] SIGTERM received. Shutting down...");
    controller.abort();
});

// Stay alive until aborted
try {
    await new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
} catch (e) {
    if (e instanceof Error && e.message === "aborted") {
        Deno.exit(0);
    }
    throw e;
}
