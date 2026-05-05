/**
 * System Reset Utility
 * Purges forensic ledgers and diagnostic logs to re-establish a baseline.
 */
const KV_PATH = "./volume/storage/orchestrator.db";
const LOG_FILE = "./volume/logs/orchestrator.log";

async function reset() {
    console.log("── Initiating Sovereign System Reset ───────────────────────────");

    // 1. Purge Deno KV
    try {
        console.log("[-] Purging forensic audit ledger (Deno KV)...");
        await Deno.remove(KV_PATH).catch(() => {});
        console.log("[+] Database purged.");
    } catch (e) {
        console.error(`[!] Failed to clear KV: ${e.message}`);
    }

    // 2. Truncate log file
    try {
        console.log("[-] Truncating diagnostic log file...");
        await Deno.writeTextFile(LOG_FILE, "");
        console.log("[+] Log file cleared.");
    } catch (e) {
        console.error(`[!] Failed to clear log file: ${e.message}`);
    }

    // 3. Clear bait directory
    try {
        console.log("[-] Clearing deception bait directory...");
        await Deno.remove("./volume/deception/bait", { recursive: true }).catch(() => {});
        console.log("[+] Deception artifacts purged.");
    } catch (e) {
        console.error(`[!] Failed to clear bait: ${e.message}`);
    }

    console.log("── Reset Complete. System ready for re-initialization. ──────────");
}

if (import.meta.main) {
    await reset();
}
