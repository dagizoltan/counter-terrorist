import { CommandResult } from "../command_manager.ts";
import { ProtectionPort } from "@core/ports.ts";
import { createProtection } from "./index.ts";

export class ProtectionAdapter implements ProtectionPort {
  private protection: any;

  constructor(protection: any) {
    this.protection = protection;
  }

  get firewall() {
    return this.protection.firewall;
  }

  get vpn() {
    return this.protection.vpn;
  }

  get antivirus() {
    return this.protection.antivirus;
  }

  get persistence() {
    return this.protection.persistence;
  }

  get pcap() {
    return this.protection.pcap;
  }

  get rkhunter() {
    return this.protection.rkhunter;
  }

  async lockdown(): Promise<CommandResult> {
    return await this.protection.lockdown();
  }
}
