import { CommandResult, ProtectionPort, AntivirusPort } from "@core/ports.ts";
import { createProtection } from "./index.ts";

export class ProtectionAdapter implements ProtectionPort {
  private protection: ProtectionPort;

  constructor(protection: ProtectionPort) {
    this.protection = protection;
  }

  get firewall(): any {
    return this.protection.firewall;
  }

  get vpn(): any {
    return this.protection.vpn;
  }

  get antivirus(): AntivirusPort {
    return this.protection.antivirus as any;
  }

  get persistence(): any {
    return this.protection.persistence;
  }

  get pcap(): any {
    return this.protection.pcap;
  }

  get rkhunter(): any {
    return this.protection.rkhunter;
  }

  async lockdown(): Promise<CommandResult> {
    return await this.protection.lockdown();
  }

  async sendCommand(name: string, cmd: any): Promise<CommandResult> {
    if (this.protection.firewall.sendCommand) {
        return await this.protection.firewall.sendCommand(name, cmd);
    }
    return { success: false, stdout: "", stderr: "Firewall provider does not support direct commands" };
  }
}
