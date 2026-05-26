import { computeHash } from "../../core/crypto_utils.ts";
import { LogSeverity, LogType } from "../../core/ports.ts";

/**
 * Sovereign Forensic Ledger Verification Tool (v1.0)
 * Iterates through the Deno KV audit store and verifies the integrity of the chain.
 */

async function verifyLedger() {
    console.log("--- Sovereign Forensic Ledger Verification Tool ---");
    const dbPath = Deno.args[0] || "./volume/storage/orchestrator.db";

    try {
        const kv = await Deno.openKv(dbPath);
        const iter = kv.list({ prefix: ["audit", "events"] }, { reverse: false });

        let count = 0;
        let prevHash = "GENESIS";
        let errors = 0;

        console.log(`Verifying chain from ${dbPath}...`);

        for await (const entry of iter) {
            const event = entry.value as any;
            count++;

            // 1. Verify Hash
            const hashInput = {
                id: event.id,
                timestamp: event.timestamp,
                type: event.type,
                severity: event.severity,
                caller: event.caller,
                message: event.message,
                actor: event.actor,
                data: event.data,
                correlationId: event.correlationId,
                prevHash: event.prevHash
            };
            const expectedHash = await computeHash(hashInput);

            if (event.hash !== expectedHash) {
                console.error(`[FAIL] Hash Mismatch at event ${event.id}`);
                console.error(`       Expected: ${expectedHash}`);
                console.error(`       Actual:   ${event.hash}`);
                errors++;
            }

            // 2. Verify Chain
            if (event.prevHash !== prevHash && event.prevHash !== "TRUNCATED") {
                console.error(`[FAIL] Chain Break at event ${event.id}`);
                console.error(`       Expected Prev: ${prevHash}`);
                console.error(`       Actual Prev:   ${event.prevHash}`);
                errors++;
            }

            // 3. Verify Hardware Signature (if present)
            if (event.hwSignature) {
                // In a real scenario, we'd use the developer public key or TPM public key to verify
                // For this CLI, we just log that it exists.
                // console.log(`[INFO] Event ${event.id.slice(0,8)} has hardware signature.`);
            }

            prevHash = event.hash;

            if (count % 100 === 0) {
                console.log(`Verified ${count} events...`);
            }
        }

        kv.close();

        console.log("\n--- Verification Summary ---");
        console.log(`Total Events Checked: ${count}`);
        console.log(`Integrity Errors:     ${errors}`);
        console.log(`Result:               ${errors === 0 ? "PASSED ✅" : "FAILED ❌"}`);

        Deno.exit(errors === 0 ? 0 : 1);
    } catch (e) {
        console.error(`Fatal Error: ${(e as Error).message}`);
        Deno.exit(1);
    }
}

if (import.meta.main) {
    verifyLedger();
}
