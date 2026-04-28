import { ProtectionPort } from "../core/ports.ts";

export class ProtectionAdapter implements ProtectionPort {
  constructor(private protection: any) {}
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
}

