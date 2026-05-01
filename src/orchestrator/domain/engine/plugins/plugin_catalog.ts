import { Plugin } from "../plugin_manager.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { PcapManager } from "@infrastructure/system/protection/pcap/pcap.ts";
import { HoneypotPlugin } from "./honeypot.ts";
import { SshHoneypotPlugin } from "./ssh_honeypot.ts";
import { RedisHoneypotPlugin } from "./redis_honeypot.ts";
import { FirewallPlugin } from "./firewall_plugin.ts";
import { VpnPlugin } from "./vpn_plugin.ts";
import { BroadcastFunction } from "./types.ts";
import { VpnManager } from "@infrastructure/system/protection/vpn/vpn.ts";

export interface PluginFactoryDependencies {
  sidecarManager: SidecarManager;
  firewall: FirewallManager;
  vpn: VpnManager;
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
    id: "firewall",
    supportedTags: ALL_TAGS,
    create: ({ firewall }) => new FirewallPlugin(firewall),
  },
  {
    id: "vpn",
    supportedTags: ALL_TAGS,
    create: ({ vpn }) => new VpnPlugin(vpn),
  },
  {
    id: "honeypot",
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
    console.warn(`[PLUGIN_CATALOG] No plugin definitions found for platform tag '${tag}'. Falling back to all available plugins.`);
    matches = pluginCatalog;
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
