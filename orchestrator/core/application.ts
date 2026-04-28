import { PluginRegistryPort, PluginFactoryPort, PlatformPort, StartupPort, CommandPort, ProtectionPort, LoggingPort, BaselinePort, MeshPort, MeshAuthPort, ConfigurationPort, WebPort } from "./ports.ts";

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
  web: WebPort;
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
    web: deps.web,
  };
}

export function createDashboardStatus(
  systemStatus: { os: string; isRoot: boolean; dependencies: Record<string, boolean> },
  platformInfo: { tag: string },
  pluginRegistry: PluginRegistryPort,
) {
  return {
    ...systemStatus,
    platformTag: platformInfo.tag,
    plugins: pluginRegistry.listPlugins(),
  };
}
