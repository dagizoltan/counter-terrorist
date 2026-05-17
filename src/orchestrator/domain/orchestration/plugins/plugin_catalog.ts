import { Plugin } from "../plugin_manager.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap/pcap.ts";
import { HoneypotPlugin } from "./honeypot.ts";
import { SshHoneypotPlugin } from "./ssh_honeypot.ts";
import { RedisHoneypotPlugin } from "./redis_honeypot.ts";
import { FirewallPlugin } from "./firewall_plugin.ts";
import { VpnPlugin } from "./vpn_plugin.ts";
import { MeshPlugin } from "./mesh_plugin.ts";
import { BroadcastFunction } from "./types.ts";
import { VpnManager } from "@infrastructure/system/protection/vpn/vpn.ts";
import { MeshManager } from "../mesh.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export interface PluginFactoryDependencies {
  sidecarManager: SidecarManager;
  firewall: FirewallManager;
  vpn: VpnManager;
  mesh: MeshManager;
  pcap: PcapManager;
  broadcast: BroadcastFunction;
}

export interface PlatformPluginDefinition {
  id: string;
  supportedTags: string[];
  create: (deps: PluginFactoryDependencies) => Plugin;
}

const ALL_TAGS = [
  "ubuntu_24.04",
  "ubuntu_26.04",
  "windows_11",
  "macos_15",
  "macos_14",
];

export const pluginCatalog: PlatformPluginDefinition[] = [
  {
    id: "tunnel",
    supportedTags: ALL_TAGS,
    create: ({ vpn }) => new VpnPlugin(vpn),
  },
  {
    id: "firewall",
    supportedTags: ALL_TAGS,
    create: ({ firewall }) => new FirewallPlugin(firewall),
  },
  {
    id: "mesh",
    supportedTags: ALL_TAGS,
    create: ({ mesh }) => new MeshPlugin(mesh),
  },
  {
    id: "decoy",
    supportedTags: ALL_TAGS,
    create: ({ sidecarManager, firewall, pcap, broadcast }) =>
      new HoneypotPlugin(sidecarManager, firewall, pcap, broadcast),
  },
];

const PLATFORM_FAMILIES: Record<string, string[]> = {
  ubuntu: ["ubuntu_24.04", "ubuntu_26.04"],
  macos: ["macos_15", "macos_14"],
  windows: ["windows_11"],
};

export function createPluginsForPlatform(tag: string, deps: PluginFactoryDependencies): Plugin[] {
  let matches = pluginCatalog.filter((entry) => entry.supportedTags.includes(tag));

  if (matches.length === 0) {
    const family = tag.split("_")[0];
    const fallbackTags = PLATFORM_FAMILIES[family] ?? [];
    if (fallbackTags.length > 0) {
      matches = pluginCatalog.filter((entry) =>
        entry.supportedTags.some((supportedTag) => fallbackTags.includes(supportedTag)),
      );
    }
  }

  if (matches.length === 0) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.WARNING,
        caller: "PLUGIN_CATALOG",
        message: `No plugin definitions found for platform tag '${tag}'. Falling back to safe defaults.`
    });
    // BUG-11.2 FIX: Return empty list or core-only plugins instead of shadowing all
    // Matches stays empty or we could explicitly add core plugins
  }

  return matches.map((entry) => entry.create(deps));
}

export function createPluginFactory(deps: PluginFactoryDependencies) {
  return {
    createPluginsForPlatform: (tag: string) => createPluginsForPlatform(tag, deps),
  };
}

export function getSupportedPlatformTags(): string[] {
  return Array.from(new Set(pluginCatalog.flatMap((entry) => entry.supportedTags)));
}
