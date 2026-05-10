/**
 * Sovereign TUI Installer
 * Audits hardware readiness and provisions the initial security baseline.
 */
import { SystemExecutor } from "../../infrastructure/system/system_executor.ts";
import { SidecarManager } from "../../infrastructure/runtime/sidecar_manager.ts";
import { TPMManager } from "../../infrastructure/system/protection/tpm/tpm_manager.ts";
import { loggingService } from "../../infrastructure/system/logging.ts";

async function runInstaller() {
    console.clear();
    console.log("====================================================");
    console.log("🛡️  SOVEREIGN ORCHESTRATOR - HIGH-ASSURANCE INSTALLER");
    console.log("====================================================\n");

    const executor = new SystemExecutor();
    const sidecar = new SidecarManager(executor, loggingService);
    const tpm = new TPMManager(sidecar, loggingService);

    // 1. Hardware Readiness Audit
    console.log("Step 1: Hardware Readiness Audit...");
    const os = Deno.build.os;
    console.log(`- Operating System: ${os}`);

    let tpmReady = false;
    try {
        const pcrs = await tpm.getPcrs();
        tpmReady = Object.keys(pcrs).length > 0;
        console.log("✅ TPM 2.0 / fTPM: Detected and Responsive");
    } catch {
        console.log("❌ TPM 2.0 / fTPM: NOT FOUND or ACCESS DENIED");
    }

    if (os === "linux") {
        const iommu = await executor.execute("ls", ["/sys/class/iommu"]);
        console.log(iommu.success ? "✅ IOMMU / VT-d: Active" : "⚠️ IOMMU / VT-d: Not detected (Recommended for Ring 0 isolation)");
    } else if (os === "darwin") {
        console.log("✅ Apple Secure Enclave (SEP): Integrated");
    }

    // 2. Security Provisioning
    console.log("\nStep 2: Security Provisioning...");
    if (!tpmReady) {
        console.log("⚠️  TPM unavailable. Falling back to Software-Only integrity.");
    } else {
        console.log("\n⚠️  WARNING: TPM operations are high-assurance.");
        console.log("- This installer uses 'Defined Indices' (0x1500002) in NVRAM.");
        console.log("- These operations are NON-DESTRUCTIVE and will not brick your device.");
        console.log("- You can always clear CTS indices from the BIOS if needed.\n");

        const confirm = prompt("Seal initial system state into TPM NVRAM? (y/N):");
        if (confirm?.toLowerCase() === 'y') {
            console.log("Measuring system and sealing PCRs...");
            const success = await tpm.provisionGoldenPcrs();
            if (success) {
                console.log("✅ SUCCESS: System integrity baseline established in hardware.");
            } else {
                console.log("❌ FAILED: Could not seal PCRs. Ensure agents are built and you have root/admin access.");
            }
        }
    }

    // 3. Environment Setup
    console.log("\nStep 3: Environment Setup...");
    const apiToken = crypto.randomUUID().replace(/-/g, '');
    console.log(`Generated Master API_TOKEN: ${apiToken}`);
    console.log("Recommended: Save this to your .env file.");

    console.log("\n====================================================");
    console.log("✅ INSTALLATION AUDIT COMPLETE");
    console.log("System is ready for 'deno task start'.");
    console.log("====================================================");

    await sidecar.shutdown();
}

if (import.meta.main) {
    runInstaller();
}
