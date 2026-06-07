import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LoggingPort } from "../../../core/ports/logging.ts";
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
  networkLogs: LoggingPort,
): Protection {
  const firewall = createFirewallManager(sidecar, executor, platformInfo, networkLogs);
  return {
    firewall,
    vpn: createVpnManager(sidecar, executor, platformInfo),
    antivirus: createAntivirusManager(sidecar, executor, platformInfo),
    persistence: createPersistenceManager(sidecar, executor, platformInfo),
    pcap: createPcapManager(sidecar, executor, platformInfo),
    rkhunter: new RkhunterManager(sidecar),
    lockdown: () => firewall.lockdown(),
  };
}
