import { CommandResult, ProtectionPort, AntivirusPort, FirewallPort, VpnPort, PersistencePort, PcapPort, RkhunterPort } from "@core/ports.ts";
import { createProtection } from "./index.ts";

export class ProtectionAdapter implements ProtectionPort {
  private protection: ProtectionPort;

  constructor(protection: ProtectionPort) {
    this.protection = protection;
  }

  get firewall(): FirewallPort {
    return this.protection.firewall;
  }

  get vpn(): VpnPort {
    return this.protection.vpn;
  }

  get antivirus(): AntivirusPort {
    return this.protection.antivirus;
  }

  get persistence(): PersistencePort {
    return this.protection.persistence;
  }

  get pcap(): PcapPort {
    return this.protection.pcap;
  }

  get rkhunter(): RkhunterPort {
    return this.protection.rkhunter;
  }

  async lockdown(): Promise<CommandResult> {
    return await this.protection.lockdown();
  }

  async sendCommand(name: string, cmd: string | Record<string, unknown>): Promise<CommandResult> {
    if (this.protection.firewall.sendCommand) {
        return await this.protection.firewall.sendCommand(name, cmd);
    }
    return { success: false, stdout: "", stderr: "Firewall provider does not support direct commands" };
  }
}
