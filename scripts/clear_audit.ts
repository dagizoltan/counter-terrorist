/**
 * Emergency Audit Ledger Wipe
 * Clears corrupted audit data to allow orchestrator boot.
 * WARNING: Destroys all audit history. Use only in recovery scenarios.
 */
import { load } from "@std/dotenv";

async function clearAudit() {
    const kv = await Deno.openKv("./volume/storage/orchestrator.db");

    console.log("Clearing audit ledger...");
    
    // Delete all audit entries
    const auditIter = kv.list({ prefix: ["audit"] });
    let deleted = 0;
    
    for await (const entry of auditIter) {
        await kv.delete(entry.key);
        deleted++;
    }

    console.log(`Deleted ${deleted} audit entries from KV store.`);

    // Clear lockdown if present
    const lockdown = await kv.get(["system", "lockdown"]);
    if (lockdown.value) {
        await kv.delete(["system", "lockdown"]);
        console.log("Cleared system lockdown state.");
    }

    console.log("SUCCESS: Audit ledger cleared. Orchestrator can now boot.");
    kv.close();
}

if (import.meta.main) {
    clearAudit().catch(e => {
        console.error("ERROR:", e.message);
        Deno.exit(1);
    });
}
