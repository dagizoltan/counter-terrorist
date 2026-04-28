import { bootstrap } from "./bootstrapper.ts";
import { firewall, vpn, pcap } from "./protection/index.ts";
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
import { auditService } from "./services/audit.ts";
import { notificationService } from "./services/alerts.ts";
import { eventBus } from "./services/events.ts";
import { broadcast } from "./api/ws.ts";
import { SidecarEvent } from "./services/validation.ts";

// Initialize Application via hexagonal core
const app = await initializeApplication({
  startup: { bootstrap },
  platform: { getPlatformInfo },
  pluginRegistry: pluginManager,
  pluginFactory: createPluginFactory({
    commandManager,
    firewall,
    vpn,
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
  audit: auditService,
  notifications: notificationService,
  eventBus: eventBus,
});

const web = new WebAdapter(
  configurationAdapter,
  protectionAdapter,
  commandAdapter,
  createDashboardStatus(app.systemStatus, app.platformInfo, pluginManager),
  app.platformInfo
);

// Handle eBPF events
app.command.onEvent("ebpf", (event: SidecarEvent) => {
  if (event.type === "SYSCALL_EVENT") {
    let type = "INFO";
    if (event.syscall === "ptrace") {
      type = "CRITICAL";
    } else if (event.syscall === "mmap") {
      type = "WARN";
    }

    broadcast({
      type,
      message: `eBPF Alert: ${event.comm} (PID: ${event.pid}) called ${event.syscall}`,
      data: event
    });
  }
});

// Start eBPF sidecar
app.command.getPersistentSidecar("ebpf").catch(err => {
  console.warn("[MAIN] Failed to start eBPF sidecar:", err.message);
});

// Start the web server
await web.start();