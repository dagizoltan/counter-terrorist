/**
 * Sovereign Recovery Utility
 * Allows clearing the system HARD_LOCK state with a valid recovery token.
 */
import { load } from "@std/dotenv";

async function recover() {
    // We don't need strict env validation for recovery script
    const env = await load({ export: true, allowEmptyValues: true }).catch(() => ({}));

    const token = Deno.args[0];
    const expectedToken = Deno.env.get("RECOVERY_TOKEN");

    if (!expectedToken || expectedToken.length < 32) {
        console.error("ERROR: RECOVERY_TOKEN not configured or too weak (min 32 chars).");
        Deno.exit(1);
    }

    if (token !== expectedToken) {
        console.error("ERROR: Invalid recovery token.");
        Deno.exit(1);
    }

    console.log("Token validated. Accessing KV store...");
    const kv = await Deno.openKv("./volume/storage/orchestrator.db");

    const lockdown = await kv.get(["system", "lockdown"]);
    if (!lockdown.value) {
        console.log("System is not in lockdown state. No action required.");
    } else {
        console.log("Current lockdown found:", lockdown.value);
        await kv.delete(["system", "lockdown"]);
        console.log("SUCCESS: System lockdown cleared. You can now restart the orchestrator.");
    }

    kv.close();
}

if (import.meta.main) {
    if (Deno.args.length === 0) {
        console.log("Usage: deno run -A scripts/recover.ts <RECOVERY_TOKEN>");
        Deno.exit(1);
    }
    recover();
}
