import { PluginRegistryPort, PluginFactoryPort, PlatformPort, StartupPort, CommandPort, ProtectionPort, LoggingPort, BaselinePort, MeshPort, MeshAuthPort, ConfigurationPort, WebPort, AuditPort, NotificationPort, EventBusPort, LogSeverity, LogType } from "./ports.ts";

export interface ApplicationDependencies {
  startup: StartupPort;
  platform: PlatformPort;
  pluginRegistry: PluginRegistryPort;
  pluginFactory: PluginFactoryPort;
  command: CommandPort;
  protection: ProtectionPort;
  logging: LoggingPort;
  baseline: BaselinePort;
  mesh: MeshPort;
  meshAuth: MeshAuthPort;
  config: ConfigurationPort;
  audit: AuditPort;
  notifications: NotificationPort;
  eventBus: EventBusPort;
}

export async function initializeApplication(deps: ApplicationDependencies) {
  // Enable logging early
  deps.logging.enableGlobalIntercept();

  const systemStatus = await deps.startup.bootstrap();
  const platformInfo = await deps.platform.getPlatformInfo();
  const plugins = deps.pluginFactory.createPluginsForPlatform(platformInfo.tag);

  for (const plugin of plugins) {
    deps.pluginRegistry.register(plugin);
  }

  await deps.pluginRegistry.startAll();

  // Start background services
  deps.baseline.startMonitor();
  await deps.mesh.init();
  deps.mesh.startDiscovery();

  // Register all services to the service locator for decoupled access
  const { serviceLocator } = await import("./service_locator.ts");
  serviceLocator.register("config", deps.config);
  serviceLocator.register("protection", deps.protection);
  serviceLocator.register("command", deps.command);
  serviceLocator.register("logging", deps.logging);
  serviceLocator.register("audit", deps.audit);
  serviceLocator.register("mesh", deps.mesh);
  serviceLocator.register("eventBus", deps.eventBus);
  serviceLocator.register("notifications", deps.notifications);
  serviceLocator.register("baseline", deps.baseline);

  // Automated Forensic Response
  const { BackgroundTaskManager } = await import("./utils/background_task_manager.ts");
  const forensicTaskManager = new BackgroundTaskManager(deps.logging);

  deps.eventBus.subscribe(async (event) => {
    if (event.type === "CRITICAL") {
        forensicTaskManager.run("critical_pcap_capture", async () => {
            const res = await deps.protection.pcap.startCapture("any", 60, `intrusion_${Date.now()}.pcap`);
            if (!res.success) {
                throw new Error(`PCAP capture failed: ${res.stderr}`);
            }
        });
    }
  });

  return {
    systemStatus,
    platformInfo,
    command: deps.command,
    protection: deps.protection,
    logging: deps.logging,
    baseline: deps.baseline,
    mesh: deps.mesh,
    meshAuth: deps.meshAuth,
    config: deps.config,
    audit: deps.audit,
    notifications: deps.notifications,
    eventBus: deps.eventBus,
  };
}

import { AuditService } from "../domain/analysis/audit.ts";

export async function createDashboardStatus(
  systemStatus: { os: string; isRoot: boolean; dependencies: Record<string, boolean> },
  platformPort: PlatformPort,
  pluginRegistry: PluginRegistryPort,
  auditService?: AuditService,
) {
  const platform = await platformPort.getPlatformInfo();
  const auditVerification = auditService ? await auditService.verifyChain(100) : { valid: true };
  
  return {
    ...systemStatus,
    platformTag: platform.tag,
    platform,
    plugins: pluginRegistry.listPlugins(),
    auditVerified: auditVerification.valid,
  };
}
