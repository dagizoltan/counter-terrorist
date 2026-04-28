import { bootstrap } from "./bootstrapper.ts";
import { createProtection } from "./protection/index.ts";
import { pluginManager, getPlatformInfo, AuditService, NotificationService, EventBus, MeshManager, BaselineService, MeshAuthService, CommandManager, LoggingService } from "./services/index.ts";
import { createPluginFactory } from "./plugins/plugin_catalog.ts";
import { initializeApplication, createDashboardStatus } from "./core/application.ts";
import { CommandAdapter } from "./adapters/command_adapter.ts";
import { ProtectionAdapter } from "./adapters/protection_adapter.ts";
import { LoggingAdapter } from "./adapters/logging_adapter.ts";
import { BaselineAdapter } from "./adapters/baseline_adapter.ts";
import { MeshAdapter } from "./adapters/mesh_adapter.ts";
import { MeshAuthAdapter } from "./adapters/mesh_auth_adapter.ts";
import { configurationAdapter } from "./adapters/configuration_adapter.ts";
import { WebAdapter } from "./adapters/web_adapter.tsx";
import { broadcast, initBroadcaster } from "./api/ws.ts";
import { SidecarEvent } from "./infrastructure/validation.ts";

const loggingService = new LoggingService();
const commandManager = new CommandManager();

const platformInfo = await getPlatformInfo();
const protection = createProtection(commandManager, platformInfo);

const auditService = new AuditService();
const notificationService = new NotificationService();
const eventBus = new EventBus();
const meshAuthService = new MeshAuthService();
const meshManager = new MeshManager(meshAuthService);
const baselineService = new BaselineService();

initBroadcaster({
  notificationService,
  auditService,
  eventBus,
});

// Initialize Application via hexagonal core
const app = await initializeApplication({
  startup: { bootstrap },
  platform: { getPlatformInfo },
  pluginRegistry: pluginManager,
  pluginFactory: createPluginFactory({
    commandManager,
    firewall: protection.firewall,
    vpn: protection.vpn,
    pcap: protection.pcap,
    broadcast,
  }),
  command: new CommandAdapter(commandManager),
  protection: new ProtectionAdapter(protection),
  logging: new LoggingAdapter(loggingService),
  baseline: new BaselineAdapter(baselineService),
  mesh: new MeshAdapter(meshManager),
  meshAuth: new MeshAuthAdapter(meshAuthService),
  config: configurationAdapter,
  audit: auditService,
  notifications: notificationService,
  eventBus: eventBus,
});

const web = new WebAdapter(
  configurationAdapter,
  app.protection,
  app.command,
  createDashboardStatus(app.systemStatus, app.platformInfo, pluginManager),
  app.platformInfo,
  auditService,
  notificationService,
  baselineService
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