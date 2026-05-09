import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { PlatformInfo } from "../platform.ts";
import { AntivirusManager } from "./antivirus/antivirus.ts";
import { FirewallManager } from "./firewall/firewall.ts";
import { PersistenceManager } from "./persistence/persistence.ts";
import { PcapManager } from "./pcap/pcap.ts";
import { VpnManager } from "./vpn/vpn.ts";
import { UbuntuAntivirusProvider } from "./antivirus/providers/ubuntu_antivirus.ts";
import { UbuntuFirewallProvider } from "./firewall/providers/ubuntu_firewall.ts";
import { UbuntuPersistenceProvider } from "./persistence/providers/ubuntu_persistence.ts";
import { UbuntuVpnProvider } from "./vpn/providers/ubuntu_vpn.ts";
import { UbuntuPcapProvider } from "./pcap/providers/ubuntu_pcap.ts";
import { WindowsFirewallProvider } from "./firewall/providers/windows_firewall.ts";
import { WindowsPersistenceProvider } from "./persistence/providers/windows_persistence.ts";
import { WindowsVpnProvider } from "./vpn/providers/windows_vpn.ts";
import { WindowsPcapProvider } from "./pcap/providers/windows_pcap.ts";
import { WindowsAntivirusProvider } from "./antivirus/providers/windows_antivirus.ts";
import { MacosFirewallProvider } from "./firewall/providers/macos_firewall.ts";
import { MacosVpnProvider } from "./vpn/providers/macos_vpn.ts";
import { MacosPersistenceProvider } from "./persistence/providers/macos_persistence.ts";
import { MacosPcapProvider } from "./pcap/providers/macos_pcap.ts";
import { MacosAntivirusProvider } from "./antivirus/providers/macos_antivirus.ts";

export function createFirewallManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo, networkLogs: any): FirewallManager {
  if (platform.name === "windows") {
    return new FirewallManager(new WindowsFirewallProvider(executor), networkLogs);
  }
  if (platform.name === "macos") {
    return new FirewallManager(new MacosFirewallProvider(executor), networkLogs);
  }
  return new FirewallManager(new UbuntuFirewallProvider(sidecar, executor), networkLogs);
}

export function createVpnManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): VpnManager {
  let provider;
  if (platform.name === "windows") {
    provider = new WindowsVpnProvider(executor);
  } else if (platform.name === "macos") {
    provider = new MacosVpnProvider(executor);
  } else {
    provider = new UbuntuVpnProvider(sidecar);
  }
  return new VpnManager(provider);
}

export function createAntivirusManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): AntivirusManager {
  if (platform.name === "macos") {
    return new AntivirusManager(new MacosAntivirusProvider(executor));
  }
  if (platform.name === "windows") {
    return new AntivirusManager(new WindowsAntivirusProvider(executor));
  }
  return new AntivirusManager(new UbuntuAntivirusProvider(sidecar));
}

export function createPersistenceManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): PersistenceManager {
  if (platform.name === "windows") {
    return new PersistenceManager(new WindowsPersistenceProvider(executor));
  }
  if (platform.name === "macos") {
    return new PersistenceManager(new MacosPersistenceProvider(executor));
  }
  return new PersistenceManager(new UbuntuPersistenceProvider(executor));
}

export function createPcapManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): PcapManager {
  if (platform.name === "macos") {
    return new PcapManager(new MacosPcapProvider(executor));
  }
  if (platform.name === "windows") {
    return new PcapManager(new WindowsPcapProvider(executor));
  }
  return new PcapManager(new UbuntuPcapProvider(executor));
}
