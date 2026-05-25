/**
 * System Reset Tool for Counter-Terrorist Orchestrator.
 * Wipes the database and all logs to allow a fresh start.
 */

const pathsToWipe = [
    "./volume/storage/orchestrator.db",
    "./volume/storage/orchestrator.db-wal",
    "./volume/storage/orchestrator.db-shm",
    "./volume/logs/orchestrator.log",
];

console.log("--- INITIATING SYSTEM RESET ---");

for (const path of pathsToWipe) {
    try {
        await Deno.remove(path);
        console.log(`[SUCCESS] Wiped: ${path}`);
    } catch (e: unknown) {
        if (e instanceof Deno.errors.NotFound) {
            console.log(`[SKIPPED] Not found: ${path}`);
        } else {
            console.error(`[ERROR] Failed to wipe ${path}: ${(e as Error)?.message ?? String(e)}`);
        }
    }
}

// Also wipe any audit logs if they are stored separately (though they should be in the DB)
// But we can also clear the entire volume/storage if preferred.
try {
    const entries = await Deno.readDir("./volume/storage");
    for await (const entry of entries) {
        if (entry.isFile && !pathsToWipe.includes(`./volume/storage/${entry.name}`)) {
             await Deno.remove(`./volume/storage/${entry.name}`);
             console.log(`[SUCCESS] Wiped additional storage file: ${entry.name}`);
        }
    }
} catch (e: unknown) {
     if (!(e instanceof Deno.errors.NotFound)) {
        console.error(`[ERROR] Failed to clean storage directory: ${(e as Error)?.message ?? String(e)}`);
     }
}

console.log("--- SYSTEM RESET COMPLETE ---");
console.log("The next start will be from a fresh state.");
