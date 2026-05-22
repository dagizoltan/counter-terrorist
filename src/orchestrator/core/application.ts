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

  // Automated Forensic Response
  deps.eventBus.subscribe(async (event) => {
    if (event.type === "CRITICAL") {
        try {
            const res = await deps.protection.pcap.startCapture("any", 60, `intrusion_${Date.now()}.pcap`);
            if (!res.success) {
                deps.logging.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:core:application:forensics",
                    message: `CRITICAL: Automated PCAP capture failed: ${res.stderr}`
                });
            }
        } catch (err) {
            deps.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:core:application:forensics",
                message: `Unexpected PCAP error during forensic response: ${err instanceof Error ? err.message : String(err)}`
            });
        }
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
  auditService?: any,
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
