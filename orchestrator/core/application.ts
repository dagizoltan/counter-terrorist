import { PluginRegistryPort, PluginFactoryPort, PlatformPort, StartupPort, CommandPort, ProtectionPort, LoggingPort, BaselinePort, MeshPort, MeshAuthPort, ConfigurationPort, WebPort, AuditPort, NotificationPort, EventBusPort } from "./ports.ts";

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

  // Automated Forensic Response
  deps.eventBus.subscribe((event) => {
    if (event.type === "CRITICAL") {
      deps.protection.pcap.startCapture("any", 60, `intrusion_${Date.now()}.pcap`)
        .then(res => {
          if (!res.success) console.warn("[FORENSICS] PCAP capture failed:", res.stderr);
        })
        .catch(err => console.error("[FORENSICS] Unexpected PCAP error:", err));
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

export async function createDashboardStatus(
  systemStatus: { os: string; isRoot: boolean; dependencies: Record<string, boolean> },
  platformPort: PlatformPort,
  pluginRegistry: PluginRegistryPort,
) {
  const platform = await platformPort.getPlatformInfo();
  return {
    ...systemStatus,
    platformTag: platform.tag,
    platform,
    plugins: pluginRegistry.listPlugins(),
  };
}
