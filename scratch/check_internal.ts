import { SidecarManager } from "./src/orchestrator/infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "./src/orchestrator/infrastructure/system/system_executor.ts";
import { loggingService } from "./src/orchestrator/infrastructure/system/logging.ts";

const executor = new SystemExecutor();
const sm = new SidecarManager(executor, loggingService);

console.log("ebpf isRunning:", sm.isRunning("ebpf"));
console.log("ebpf PID:", sm.getPID("ebpf"));

// Check if it's in persistentProcesses
const processes = (sm as any).persistentProcesses;
console.log("Persistent Processes:", Array.from(processes.keys()));
