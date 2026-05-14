
import { MeshManager } from "./src/orchestrator/domain/orchestration/mesh.ts";
import { MeshAuthService } from "./src/orchestrator/domain/identity/mesh_auth.ts";
import { AuditService } from "./src/orchestrator/domain/analysis/audit.ts";
import { loggingService } from "./src/orchestrator/infrastructure/system/logging.ts";
import { TPMManager } from "./src/orchestrator/infrastructure/system/protection/tpm/tpm_manager.ts";
import { SidecarManager } from "./src/orchestrator/infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "./src/orchestrator/infrastructure/system/system_executor.ts";

// Mocking dependencies for a quick logic test
const executor = new SystemExecutor();
const sm = new SidecarManager(executor, loggingService);
const tpm = new TPMManager(sm, loggingService);
const kv = await Deno.openKv(":memory:");
const auth = new MeshAuthService(kv, loggingService, tpm);
const audit = { syncEvents: () => Promise.resolve() } as any;

const mesh = new MeshManager(auth, loggingService, audit);

console.log("--- Mesh Manager Initialization Test ---");
await mesh.init();
console.log("Node ID generated:", mesh.getNodeId());

console.log("--- Discovery Logic Check ---");
// We don't want to actually scan the network in the test, just check if it starts
try {
    mesh.startDiscovery();
    console.log("Discovery started successfully.");
} catch (e) {
    console.log("Discovery failed (expected if network restricted):", e.message);
}

console.log("--- SSRF / Validation Check ---");
import { isValidIP } from "./src/orchestrator/infrastructure/system/validation.ts";
const testIps = ["127.0.0.1", "10.0.0.1", "172.20.0.10", "169.254.169.254", "not-an-ip"];
for (const ip of testIps) {
    console.log(`IP ${ip} valid for mesh?`, isValidIP(ip));
}

mesh.stop();
kv.close();
console.log("--- Test Complete ---");
