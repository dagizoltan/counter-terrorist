import { SidecarManager } from "../../runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { PlatformInfo } from "../platform.ts";
import { AntivirusManager } from "./antivirus.ts";
import { FirewallManager } from "./firewall.ts";
import { PersistenceManager } from "./persistence.ts";
import { PcapManager } from "./pcap.ts";
import { VpnManager } from "./vpn.ts";
import { UbuntuAntivirusProvider } from "./providers/ubuntu_antivirus.ts";
import { UbuntuFirewallProvider } from "./providers/ubuntu_firewall.ts";
import { UbuntuPersistenceProvider } from "./providers/ubuntu_persistence.ts";
import { UbuntuVpnProvider } from "./providers/ubuntu_vpn.ts";
import { WindowsFirewallProvider } from "./providers/windows_firewall.ts";
import { WindowsPersistenceProvider } from "./providers/windows_persistence.ts";
import { WindowsVpnProvider } from "./providers/windows_vpn.ts";

export function createFirewallManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): FirewallManager {
  if (platform.name === "windows") {
    return new FirewallManager(new WindowsFirewallProvider(executor));
  }
  return new FirewallManager(new UbuntuFirewallProvider(sidecar, executor));
}

export function createVpnManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): VpnManager {
  let provider;
  if (platform.name === "windows") {
    provider = new WindowsVpnProvider(executor);
  } else {
    provider = new UbuntuVpnProvider(executor);
  }
  return new VpnManager(provider);
}

export function createAntivirusManager(sidecar: SidecarManager, executor: SystemExecutor): AntivirusManager {
  return new AntivirusManager(new UbuntuAntivirusProvider(executor));
}

export function createPersistenceManager(sidecar: SidecarManager, executor: SystemExecutor, platform: PlatformInfo): PersistenceManager {
  if (platform.name === "windows") {
    return new PersistenceManager(new WindowsPersistenceProvider(executor));
  }
  return new PersistenceManager(new UbuntuPersistenceProvider(executor));
}

export function createPcapManager(sidecar: SidecarManager): PcapManager {
  return new PcapManager(sidecar);
}
