import { bootstrap } from "./bootstrapper.ts";
import { createProtection } from "./protection/index.ts";
import { pluginManager, getPlatformInfo, AuditService, NotificationService, EventBus, MeshManager, BaselineService, MeshAuthService, LoggingService, ProcessTracker, SessionService, ApiKeysService, PlaybookService } from "./services/index.ts";
import { setMeshManager } from "./services/mesh.ts";
import { SidecarManager } from "./infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "./infrastructure/system_executor.ts";
import { KvStore } from "./infrastructure/kv_store.ts";
import { createPluginFactory } from "./plugins/plugin_catalog.ts";
import { initializeApplication, createDashboardStatus } from "./core/application.ts";
import { CommandAdapter } from "./adapters/command_adapter.ts";
import { ProtectionAdapter } from "./adapters/protection_adapter.ts";
import { LoggingAdapter } from "./adapters/logging_adapter.ts";
import { BaselineAdapter } from "./adapters/baseline_adapter.ts";
import { MeshAdapter } from "./adapters/mesh_adapter.ts";
import { MeshAuthAdapter } from "./adapters/mesh_auth_adapter.ts";
import { EnvConfigProvider } from "./infrastructure/env_config_provider.ts";
import { WebAdapter } from "./adapters/web_adapter.tsx";
import { broadcast, initBroadcaster } from "./api/ws.ts";
import { SidecarEvent } from "./infrastructure/validation.ts";

const configProvider = new EnvConfigProvider();
const loggingService = new LoggingService();
const executor = new SystemExecutor();
const sidecarManager = new SidecarManager(executor);

const platformInfo = await getPlatformInfo();
const protection = createProtection(sidecarManager, executor, platformInfo);

const kvStore = new KvStore();
const kv = await kvStore.init();

const auditService = new AuditService(kv, loggingService);
const notificationService = new NotificationService(kv, loggingService);
const eventBus = new EventBus(loggingService);
const meshAuthService = new MeshAuthService(kv);
const meshManager = new MeshManager(meshAuthService, loggingService);
setMeshManager(meshManager);
const processTracker = new ProcessTracker(loggingService);
const baselineService = new BaselineService(kv, sidecarManager, executor, loggingService);
const sessionService = new SessionService(kv, loggingService, configProvider.getNumber("SESSION_TTL_HOURS", 24));
const apiKeysService = new ApiKeysService(kv, loggingService);
const playbookService = new PlaybookService(sidecarManager, protection, notificationService, meshManager);
await playbookService.init();

initBroadcaster({
  notificationService,
  auditService,
  eventBus,
  loggingService,
});

// Initialize Application via hexagonal core
const app = await initializeApplication({
  startup: { bootstrap },
  platform: { getPlatformInfo },
  pluginRegistry: pluginManager,
  pluginFactory: createPluginFactory({
    sidecarManager,
    firewall: protection.firewall,
    vpn: protection.vpn,
    pcap: protection.pcap,
    broadcast,
  }),
  command: new CommandAdapter(sidecarManager),
  protection: new ProtectionAdapter(protection),
  logging: new LoggingAdapter(loggingService),
  baseline: new BaselineAdapter(baselineService),
  mesh: new MeshAdapter(meshManager),
  meshAuth: new MeshAuthAdapter(meshAuthService),
  config: configProvider,
  audit: auditService,
  notifications: notificationService,
  eventBus: eventBus,
});

const web = new WebAdapter(
  configProvider,
  app.protection,
  app.command,
  createDashboardStatus(app.systemStatus, app.platformInfo, pluginManager),
  app.platformInfo,
  auditService,
  notificationService,
  baselineService,
  processTracker,
  sessionService,
  apiKeysService,
  app.eventBus
);

// Handle eBPF events
app.command.onEvent("ebpf", async (event: SidecarEvent) => {
  if (event.type === "SYSCALL_EVENT") {
    let type = "INFO";
    let message = `eBPF Alert: ${event.comm} (PID: ${event.pid}) called ${event.syscall}`;

    if (event.syscall === "ptrace") {
      type = "CRITICAL";
    } else if (event.syscall === "mmap") {
      type = "WARN";
    } else if (event.syscall === "execve") {
      type = "WARN";
      const analysis = await processTracker.analyzeEvent(event.pid, event.comm);
      if (analysis.isStrayShell) {
        type = "CRITICAL";
        message = `STRAY SHELL DETECTED: ${event.comm} (PID: ${event.pid}) spawned by suspicious parent. Reason: ${analysis.reason}`;
      }
      event.ppid = analysis.ppid;
    }

    broadcast({
      type,
      message,
      data: event
    });
  }
});

// Start persistent sidecars
const daemons = ["ebpf", "honeypot", "fim"];
for (const daemon of daemons) {
  app.command.getPersistentSidecar(daemon).catch(err => {
    console.warn(`[MAIN] Failed to start sidecar ${daemon}:`, err.message);
  });
}

// Start the web server
await web.start();