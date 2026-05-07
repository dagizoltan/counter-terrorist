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

export function createFirewallManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo, networkLogs: any): FirewallManager {
  if (platform.name === "windows") {
    return new FirewallManager(new WindowsFirewallProvider(executor), networkLogs);
  }
  return new FirewallManager(new UbuntuFirewallProvider(sidecar, executor), networkLogs);
}

export function createVpnManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): VpnManager {
  let provider;
  if (platform.name === "windows") {
    provider = new WindowsVpnProvider(executor);
  } else {
    provider = new UbuntuVpnProvider(sidecar);
  }
  return new VpnManager(provider);
}

export function createAntivirusManager(sidecar: SidecarManager, executor: SystemExecutor): AntivirusManager {
  return new AntivirusManager(new UbuntuAntivirusProvider(sidecar));
}

export function createPersistenceManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): PersistenceManager {
  if (platform.name === "windows") {
    return new PersistenceManager(new WindowsPersistenceProvider(executor));
  }
  return new PersistenceManager(new UbuntuPersistenceProvider(executor));
}

export function createPcapManager(sidecar: SidecarManager, executor: SystemExecutor): PcapManager {
  return new PcapManager(new UbuntuPcapProvider(executor));
}
