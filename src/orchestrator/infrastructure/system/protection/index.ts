import { SidecarManager } from "../../runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { PlatformInfo } from "../platform.ts";
import {
  createAntivirusManager,
  createFirewallManager,
  createPersistenceManager,
  createPcapManager,
  createVpnManager,
} from "./factory.ts";
import { RkhunterManager } from "./rkhunter/rkhunter.ts";
import { FirewallManager } from "./firewall/firewall.ts";
import { VpnManager } from "./vpn/vpn.ts";
import { AntivirusManager } from "./antivirus/antivirus.ts";
import { PersistenceManager } from "./persistence/persistence.ts";
import { PcapManager } from "./pcap/pcap.ts";

import { CommandResult } from "@core/ports.ts";

export interface Protection {
  firewall: FirewallManager;
  vpn: VpnManager;
  antivirus: AntivirusManager;
  persistence: PersistenceManager;
  pcap: PcapManager;
  rkhunter: RkhunterManager;
  lockdown(): Promise<CommandResult>;
}

export function createProtection(
  sidecar: SidecarManager,
  executor: SystemExecutor,
  platformInfo: PlatformInfo,
): Protection {
  const firewall = createFirewallManager(sidecar, executor, platformInfo);
  return {
    firewall,
    vpn: createVpnManager(sidecar, executor, platformInfo),
    antivirus: createAntivirusManager(sidecar, executor),
    persistence: createPersistenceManager(sidecar, executor, platformInfo),
    pcap: createPcapManager(sidecar),
    rkhunter: new RkhunterManager(sidecar),
    lockdown: () => firewall.lockdown(),
  };
}
