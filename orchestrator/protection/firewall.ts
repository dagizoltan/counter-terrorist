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
}

export const firewall = new FirewallManager();
