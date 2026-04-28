import { CommandManager } from "../infrastructure/command_manager.ts";
import { PlatformInfo } from "../infrastructure/platform.ts";
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

export function createFirewallManager(commandManager: CommandManager, platform: PlatformInfo): FirewallManager {
  if (platform.name === "windows") {
    return new FirewallManager(new WindowsFirewallProvider());
  }
  return new FirewallManager(new UbuntuFirewallProvider());
}

export function createVpnManager(commandManager: CommandManager, platform: PlatformInfo): VpnManager {
  if (platform.name === "windows") {
    return new VpnManager(new WindowsVpnProvider());
  }
  return new VpnManager(new UbuntuVpnProvider());
}

export function createAntivirusManager(commandManager: CommandManager): AntivirusManager {
  return new AntivirusManager(new UbuntuAntivirusProvider());
}

export function createPersistenceManager(commandManager: CommandManager, platform: PlatformInfo): PersistenceManager {
  if (platform.name === "windows") {
    return new PersistenceManager(new WindowsPersistenceProvider());
  }
  return new PersistenceManager(new UbuntuPersistenceProvider());
}

export function createPcapManager(commandManager: CommandManager): PcapManager {
  return new PcapManager(commandManager);
}
