import { commandManager } from "../command_manager.ts";
import { broadcast } from "../api/ws.ts";
import { loggingService } from "../services/logging.ts";

export class FirewallManager {
  async blockIp(ip: string) {
    console.log(`[FIREWALL] Requesting block for IP: ${ip}`);
    broadcast({ type: "BLOCK", message: `Blocking malicious IP: ${ip}` });
    loggingService.logSecurityEvent({
      level: "WARNING",
      source: "FirewallManager",
      type: "IP_BLOCK",
      message: `Blocking malicious IP: ${ip}`,
      details: { ip }
    });
    const command = {
      type: "BlockIp",
      payload: { ip }
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async rateLimitIp(ip: string) {
    console.log(`[FIREWALL] Requesting rate limit for IP: ${ip}`);
    broadcast({ type: "RATE_LIMIT", message: `Rate limiting IP: ${ip}` });
    loggingService.logSecurityEvent({
      level: "INFO",
      source: "FirewallManager",
      type: "RATE_LIMIT",
      message: `Rate limiting IP: ${ip}`,
      details: { ip }
    });
    const command = {
      type: "RateLimit",
      payload: { ip }
    };
    return await commandManager.runSidecar("blocker", [JSON.stringify(command)]);
  }

  async geoBlock(ipRange: string) {
    console.log(`[FIREWALL] Requesting geo-block for range: ${ipRange}`);
    broadcast({ type: "GEO_BLOCK", message: `Blocking IP range: ${ipRange}` });
    loggingService.logSecurityEvent({
      level: "WARNING",
      source: "FirewallManager",
      type: "GEO_BLOCK",
      message: `Blocking IP range: ${ipRange}`,
      details: { ipRange }
    });
    const command = {
      type: "GeoBlock",
      payload: { ip_range: ipRange }
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
