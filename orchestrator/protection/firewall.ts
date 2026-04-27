import { commandManager } from "../command_manager.ts";
import { broadcast } from "../api/ws.ts";

export interface FirewallStatus {
  active: boolean;
  rules: string[];
  raw: string;
}

export class FirewallManager {
  async blockIp(ip: string) {
    console.log(`[FIREWALL] Requesting block for IP: ${ip}`);
    broadcast({ type: "BLOCK", message: `Blocking malicious IP: ${ip}` });
    const command = {
      type: "BlockIp",
      payload: { ip }
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async unblockIp(ip: string) {
    console.log(`[FIREWALL] Requesting unblock for IP: ${ip}`);
    broadcast({ type: "UNBLOCK", message: `Unblocking IP: ${ip}` });
    const command = {
      type: "UnblockIp",
      payload: { ip }
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async enableKillSwitch(vpnServerIp: string, vpnInterface: string) {
    console.log(`[FIREWALL] Enabling VPN Kill-switch: Server=${vpnServerIp}, Interface=${vpnInterface}`);
    const command = {
      type: "EnableKillSwitch",
      payload: { vpn_server_ip: vpnServerIp, vpn_interface: vpnInterface }
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async disableKillSwitch() {
    console.log(`[FIREWALL] Disabling VPN Kill-switch`);
    const command = {
      type: "DisableKillSwitch"
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async getStatus(): Promise<FirewallStatus> {
    const os = Deno.build.os;
    let raw = "";
    let active = false;
    const rules: string[] = [];

    if (os === "linux") {
      const result = await commandManager.execute("ufw", ["status"]);
      raw = result.stdout;
      active = raw.includes("Status: active");

      // Basic rule parsing
      const lines = raw.split("\n");
      let parsingRules = false;
      for (const line of lines) {
        if (line.includes("---")) {
          parsingRules = true;
          continue;
        }
        if (parsingRules && line.trim()) {
          rules.push(line.trim());
        }
      }
    } else if (os === "windows") {
      const result = await commandManager.execute("netsh", ["advfirewall", "show", "allprofiles"]);
      raw = result.stdout;
      active = raw.includes("ON");
    }

    return { active, rules, raw };
  }
}

export const firewall = new FirewallManager();
