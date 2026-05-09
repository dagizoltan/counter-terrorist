/**
 * Provision Integrity Tool
 * One-time setup to seal the current PCR state into TPM NVRAM.
 */
import { SovereignApp } from "../app/sovereign_app.ts";

async function provision() {
    console.log("--- Sovereign Integrity Provisioning ---");

    // We need a minimal app instance to get the TPMManager
    const app = new SovereignApp();
    // Use private access for provisioning or refactor to expose TPM
    // For this tool, we'll manually initialize what's needed

    const { SystemExecutor } = await import("../infrastructure/system/system_executor.ts");
    const { SidecarManager } = await import("../infrastructure/runtime/sidecar_manager.ts");
    const { TPMManager } = await import("../infrastructure/system/protection/tpm/tpm_manager.ts");
    const { loggingService } = await import("../infrastructure/system/logging.ts");

    const executor = new SystemExecutor();
    const sidecar = new SidecarManager(executor, loggingService);
    const tpm = new TPMManager(sidecar, loggingService);

    console.log("Measuring system and sealing PCRs...");
    const success = await tpm.provisionGoldenPcrs();

    if (success) {
        console.log("SUCCESS: System integrity baseline established.");
    } else {
        console.log("FAILED: Could not seal PCRs. Ensure TPM is available and agents are built.");
    }

    await sidecar.shutdown();
    Deno.exit(success ? 0 : 1);
}

provision();
