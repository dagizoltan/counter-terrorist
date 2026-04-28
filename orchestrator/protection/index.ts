import { CommandManager } from "../infrastructure/command_manager.ts";
import { PlatformInfo } from "../infrastructure/platform.ts";
import { createAntivirusManager, createFirewallManager, createPersistenceManager, createPcapManager, createVpnManager } from "./factory.ts";
import { RkhunterManager } from "./rkhunter.ts";

export function createProtection(commandManager: CommandManager, platformInfo: PlatformInfo) {
  return {
    firewall: createFirewallManager(commandManager, platformInfo),
    vpn: createVpnManager(commandManager, platformInfo),
    antivirus: createAntivirusManager(commandManager),
    persistence: createPersistenceManager(commandManager, platformInfo),
    pcap: createPcapManager(commandManager),
    rkhunter: new RkhunterManager(),
  };
}
