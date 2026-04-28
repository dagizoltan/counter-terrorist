import { ProtectionPort } from "../core/ports.ts";
import { firewall, vpn, antivirus, persistence, pcap, rkhunter } from "../protection/index.ts";

export class ProtectionAdapter implements ProtectionPort {
  get firewall() {
    return firewall;
  }

  get vpn() {
    return vpn;
  }

  get antivirus() {
    return antivirus;
  }

  get persistence() {
    return persistence;
  }

  get pcap() {
    return pcap;
  }

  get rkhunter() {
    return rkhunter;
  }
}

export const protectionAdapter = new ProtectionAdapter();
