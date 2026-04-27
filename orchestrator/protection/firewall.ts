import { commandManager } from "../command_manager.ts";
import { broadcast } from "../api/ws.ts";

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

  async getStatus() {
    const os = Deno.build.os;
    if (os === "linux") {
      return await commandManager.execute("ufw", ["status"]);
    } else if (os === "windows") {
      return await commandManager.execute("netsh", ["advfirewall", "show", "allprofiles"]);
    }
    return { success: false, stdout: "", stderr: "Status check not implemented for this OS" };
  }

  async enableKillSwitch(iface: string, endpoints: Array<{ ip: string, port: string }>) {
    console.log(`[FIREWALL] Enabling VPN kill-switch for interface: ${iface}`);
    broadcast({ type: "INFO", message: `Enabling VPN kill-switch for interface: ${iface}` });

    // 1. Explicitly allow outbound traffic to the VPN endpoints so WireGuard can tunnel.
    for (const endpoint of endpoints) {
        // We use insert 1 to ensure it precedes any global deny rule in standard evaluation,
        // though default deny handles the fallback.
        await commandManager.execute("ufw", ["allow", "out", "to", endpoint.ip, "port", endpoint.port, "proto", "udp"]);
    }

    // 2. Allow all outbound traffic originating from the WireGuard interface
    await commandManager.execute("ufw", ["allow", "out", "on", iface]);

    // 3. Set default outgoing policy to DENY.
    // Anything not matching the VPN endpoint or the wg interface will be blocked.
    await commandManager.execute("ufw", ["default", "deny", "outgoing"]);

    return { success: true, message: `Kill-switch enabled. Outbound limited to ${iface}.` };
  }

  async disableKillSwitch(iface?: string, endpoints?: Array<{ ip: string, port: string }>) {
    console.log(`[FIREWALL] Disabling VPN kill-switch (restoring default outgoing)`);
    broadcast({ type: "INFO", message: `Disabling VPN kill-switch` });

    // Restore default allow outgoing
    await commandManager.execute("ufw", ["default", "allow", "outgoing"]);

    // Clean up specific rules if provided
    if (iface) {
        await commandManager.execute("ufw", ["delete", "allow", "out", "on", iface]);
    }
    if (endpoints) {
        for (const endpoint of endpoints) {
            await commandManager.execute("ufw", ["delete", "allow", "out", "to", endpoint.ip, "port", endpoint.port, "proto", "udp"]);
        }
    }

    return { success: true, message: "Kill-switch disabled." };
  }
}

export const firewall = new FirewallManager();
