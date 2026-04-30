import { ProtectionPort } from "@core/ports.ts";
import { Protection } from "@infrastructure/system/protection/index.ts";

export class ProtectionAdapter implements ProtectionPort {
  constructor(private protection: Protection) {}
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

  async lockdown() {
    return await this.protection.firewall.lockdown();
  }
}

