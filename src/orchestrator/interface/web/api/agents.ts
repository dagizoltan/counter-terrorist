import { Hono, Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SidecarName, isValidIP, isCriticalInfrastructure, isAllowedSidecar } from "@infrastructure/system/validation.ts";
import { SecurityMiddleware } from "../middleware/security.ts";

export function createAgentsApi(services: ServiceContainer, security: SecurityMiddleware) {
  const router = new Hono();

  // Restart a sidecar
  router.post("/:name/restart", async (c: Context) => {
    const name = c.req.param("name") as SidecarName;
    try {
      await services.command.restartSidecar(name);
      return c.json({ success: true, message: `Agent ${name} restarted.` });
    } catch (e) {
      return c.json({ success: false, error: (e as Error).message }, 500);
    }
  });

  // Stop a sidecar
  router.post("/:name/stop", async (c: Context) => {
    const name = c.req.param("name") as SidecarName;
    try {
      await services.command.stopSidecar(name);
      return c.json({ success: true, message: `Agent ${name} deactivated.` });
    } catch (e) {
      return c.json({ success: false, error: (e as Error).message }, 500);
    }
  });

  // Send a custom command to an agent
  router.post("/:name/command", security.requireRole("admin", "operator"), async (c: Context) => {
    const name = c.req.param("name");
    if (!isAllowedSidecar(name)) return c.json({ error: "Invalid agent name" }, 400);
    
    const payload = await c.req.json();
    
    try {
      const result = await services.command.sendCommand(name, payload);
      return c.json(result);
    } catch (e) {
      return c.json({ success: false, error: (e as Error).message }, 500);
    }
  });

  // VPN specific controls
  router.post("/vpn/connect", async (c: Context) => {
    const { interface: iface } = await c.req.json();
    const result = await services.protection.vpn.connect(iface || "wg0");
    return c.json(result);
  });

  router.post("/vpn/disconnect", async (c: Context) => {
    const result = await services.protection.vpn.disconnect();
    return c.json(result);
  });

  // Firewall specific controls
  router.post("/firewall/block", async (c: Context) => {
    const role = c.get("role");
    if (role !== "admin" && role !== "operator") return c.json({ error: "Forbidden" }, 403);

    const payload = await c.req.json();
    if (!payload.ip || !isValidIP(payload.ip)) return c.json({ error: "Invalid IP address" }, 400);
    if (isCriticalInfrastructure(payload.ip)) return c.json({ error: "Cannot block critical infrastructure" }, 403);

    const result = await services.protection.firewall.blockIp(payload.ip);
    return c.json(result);
  });

  router.post("/firewall/unblock", async (c: Context) => {
    const role = c.get("role");
    if (role !== "admin" && role !== "operator") return c.json({ error: "Forbidden" }, 403);

    const payload = await c.req.json();
    if (!payload.ip || !isValidIP(payload.ip)) return c.json({ error: "Invalid IP address" }, 400);

    const result = await services.protection.firewall.unblockIp(payload.ip);
    return c.json(result);
  });

  router.post("/firewall/flush", async (c: Context) => {
    const role = c.get("role");
    if (role !== "admin") return c.json({ error: "Forbidden: Admin required to flush firewall" }, 403);

    const result = await services.protection.firewall.flushRules();
    return c.json(result);
  });

  router.get("/firewall/status", async (c: Context) => {
    const result = await services.protection.firewall.getStatus();
    return c.json(result);
  });

  // Scanner specific controls
  router.post("/scanner/scan", async (c: Context) => {
    const { path, type } = await c.req.json();

    let result;
    if (type === 'ROOTKIT') {
        result = await services.protection.rkhunter.runScan();
    } else {
        result = await services.protection.antivirus.scanPath(path || "/home/");
    }
    
    // Update metrics service with the result
    const { recordScannerResult } = await import("../../../domain/analysis/metrics_service.ts");
    recordScannerResult(new Date().toLocaleTimeString(), result.success ? "OK" : "THREAT_FOUND");
    
    return c.json(result);
  });

  router.post("/scanner/sync-signatures", async (c: Context) => {
    const result = await services.protection.antivirus.syncSignatures();
    return c.json(result);
  });
  
  router.get("/scanner/ledger", async (c: Context) => {
    const ledger = await services.curatedIntel.getLedger({ type: "HASH", minScore: 90, limit: 50 });
    return c.json(ledger);
  });

  return router;
}
