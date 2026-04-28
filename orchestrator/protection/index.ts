import { commandManager } from "../services/command_manager.ts";
import { getPlatformInfo } from "../services/platform.ts";
import { createAntivirusManager, createFirewallManager, createPersistenceManager, createPcapManager, createVpnManager } from "./factory.ts";

const platformInfo = await getPlatformInfo();

export const firewall = createFirewallManager(commandManager, platformInfo);
export const vpn = createVpnManager(commandManager, platformInfo);
export const antivirus = createAntivirusManager(commandManager);
export const persistence = createPersistenceManager(commandManager, platformInfo);
export const pcap = createPcapManager(commandManager);
export { rkhunter } from "./rkhunter.ts";
