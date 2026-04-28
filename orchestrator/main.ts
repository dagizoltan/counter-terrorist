import { bootstrap } from "./bootstrapper.ts";
import { firewall, pcap } from "./protection/index.ts";
import { pluginManager, commandManager, getPlatformInfo } from "./services/index.ts";
import { createPluginFactory } from "./plugins/plugin_catalog.ts";
import { initializeApplication, createDashboardStatus } from "./core/application.ts";
import { commandAdapter } from "./adapters/command_adapter.ts";
import { protectionAdapter } from "./adapters/protection_adapter.ts";
import { loggingAdapter } from "./adapters/logging_adapter.ts";
import { baselineAdapter } from "./adapters/baseline_adapter.ts";
import { meshAdapter } from "./adapters/mesh_adapter.ts";
import { meshAuthAdapter } from "./adapters/mesh_auth_adapter.ts";
import { configurationAdapter } from "./adapters/configuration_adapter.ts";
import { WebAdapter } from "./adapters/web_adapter.tsx";
import { broadcast } from "./api/ws.ts";

// Bootstrap system info for the dashboard
const systemStatus = await bootstrap();

// Initialize Application via hexagonal core
const { systemStatus: applicationStatus, platformInfo, command, protection, config, web } = await initializeApplication({
  startup: { bootstrap },
  platform: { getPlatformInfo },
  pluginRegistry: pluginManager,
  pluginFactory: createPluginFactory({
    commandManager,
    firewall,
    pcap,
    broadcast,
  }),
  command: commandAdapter,
  protection: protectionAdapter,
  logging: loggingAdapter,
  baseline: baselineAdapter,
  mesh: meshAdapter,
  meshAuth: meshAuthAdapter,
  config: configurationAdapter,
  web: new WebAdapter(config, protection, command, createDashboardStatus(applicationStatus, platformInfo, pluginManager), platformInfo),
});

// Handle eBPF events
command.onEvent("ebpf", (data: any) => {
  if (data.type === "SYSCALL_EVENT") {
    let type = "INFO";
    if (data.syscall === "ptrace") {
      type = "CRITICAL";
    } else if (data.syscall === "mmap") {
      type = "WARN";
    }

    broadcast({
      type,
      message: `eBPF Alert: ${data.comm} (PID: ${data.pid}) called ${data.syscall}`,
      data: data
    });
  }
});

// Start eBPF sidecar
command.getPersistentSidecar("ebpf").catch(err => {
  console.warn("[MAIN] Failed to start eBPF sidecar:", err.message);
});

// Start the web server
await web.start();