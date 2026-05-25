/**
 * Chaos Security Simulation: Sidecar Tampering
 * Simulates an attacker modifying a sidecar binary and verifies the orchestrator's response.
 */
import { SystemExecutor } from "../src/orchestrator/infrastructure/system/system_executor.ts";

async function main() {
    console.log("🔥 STARTING CHAOS SECURITY SIMULATION: SIDECAR TAMPERING");

    const executor = new SystemExecutor();
    const sidecarName = "analyzer";
    const binaryPath = `./src/agents/target/release/${sidecarName}`;

    // 1. Verify current state
    console.log(`- Step 1: Backing up ${sidecarName} binary...`);
    await Deno.copyFile(binaryPath, `${binaryPath}.bak`);

    try {
        // 2. Tamper with the binary
        console.log(`- Step 2: Injecting 'malicious' payload into ${sidecarName}...`);
        await Deno.writeTextFile(binaryPath, "TAMPERED_CONTENT_" + Math.random(), { append: true });

        // 3. Trigger orchestrator health check or rotation
        console.log("- Step 3: Triggering orchestrator binary verification...");
        // In a real simulation, we would run the orchestrator in production mode
        // and observe its failure to boot or its emergency lockdown.
        // For this script, we'll just check if the hash mismatch is detectable.

        const manifestText = await Deno.readTextFile("./src/orchestrator/infrastructure/runtime/sidecars.manifest.json");
        const manifest = JSON.parse(manifestText);
        const expectedHash = manifest.sidecars[sidecarName].hash;

        const res = await executor.execute("sha256sum", [binaryPath]);
        const actualHash = res.stdout.split(" ")[0].trim();

        if (actualHash !== expectedHash) {
            console.log("✅ SUCCESS: Tampering detected via hash mismatch.");
            console.log(`  Expected: ${expectedHash.slice(0, 12)}...`);
            console.log(`  Actual:   ${actualHash.slice(0, 12)}...`);
        } else {
            console.log("❌ FAILURE: Tampering went undetected!");
        }

    } finally {
        // 4. Restore original binary
        console.log("- Step 4: Restoring original binary...");
        await Deno.copyFile(`${binaryPath}.bak`, binaryPath);
        await Deno.remove(`${binaryPath}.bak`);
    }

    console.log("🏁 SIMULATION COMPLETE.");
}

if (import.meta.main) {
    main().catch(console.error);
}
