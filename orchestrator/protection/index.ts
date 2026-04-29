import { SidecarManager } from "../infrastructure/sidecar_manager.ts";
import { SystemExecutor } from "../infrastructure/system_executor.ts";
import { PlatformInfo } from "../infrastructure/platform.ts";
import {
  createAntivirusManager,
  createFirewallManager,
  createPersistenceManager,
  createPcapManager,
  createVpnManager,
} from "./factory.ts";
import { RkhunterManager } from "./rkhunter.ts";
import { FirewallManager } from "./firewall.ts";
import { VpnManager } from "./vpn.ts";
import { AntivirusManager } from "./antivirus.ts";
import { PersistenceManager } from "./persistence.ts";
import { PcapManager } from "./pcap.ts";

export interface Protection {
  firewall: FirewallManager;
  vpn: VpnManager;
  antivirus: AntivirusManager;
  persistence: PersistenceManager;
  pcap: PcapManager;
  rkhunter: RkhunterManager;
}

export function createProtection(
  sidecar: SidecarManager,
  executor: SystemExecutor,
  platformInfo: PlatformInfo,
): Protection {
  return {
    firewall: createFirewallManager(sidecar, executor, platformInfo),
    vpn: createVpnManager(sidecar, executor, platformInfo),
    antivirus: createAntivirusManager(sidecar, executor),
    persistence: createPersistenceManager(sidecar, executor, platformInfo),
    pcap: createPcapManager(sidecar),
    rkhunter: new RkhunterManager(sidecar),
  };
}
