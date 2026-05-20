import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SidecarName, isValidIP, isCriticalInfrastructure, isAllowedSidecar } from "@infrastructure/system/validation.ts";

export const restartSidecarHandler = (services: ServiceContainer) => async (c: Context) => {
  const name = c.req.param("name") as SidecarName;
  try {
    await services.command.restartSidecar(name);
    return c.json({ success: true, message: `Agent ${name} restarted.` });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 500);
  }
};

export const stopSidecarHandler = (services: ServiceContainer) => async (c: Context) => {
  const name = c.req.param("name") as SidecarName;
  try {
    await services.command.stopSidecar(name);
    return c.json({ success: true, message: `Agent ${name} deactivated.` });
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 500);
  }
};

export const sendAgentCommandHandler = (services: ServiceContainer) => async (c: Context) => {
  const name = c.req.param("name");
  if (!isAllowedSidecar(name)) return c.json({ error: "Invalid agent name" }, 400);

  const payload = await c.req.json();

  try {
    const result = await services.command.sendCommand(name, payload);
    return c.json(result);
  } catch (e) {
    return c.json({ success: false, error: (e as Error).message }, 500);
  }
};

export const vpnConnectHandler = (services: ServiceContainer) => async (c: Context) => {
  const { interface: iface } = await c.req.json();
  const result = await services.protection.vpn.connect(iface || "wg0");
  return c.json(result);
};

export const vpnDisconnectHandler = (services: ServiceContainer) => async (c: Context) => {
  const result = await services.protection.vpn.disconnect();
  return c.json(result);
};

export const firewallBlockHandler = (services: ServiceContainer) => async (c: Context) => {
  const payload = await c.req.json();
  if (!payload.ip || !isValidIP(payload.ip)) return c.json({ error: "Invalid IP address" }, 400);
  if (isCriticalInfrastructure(payload.ip)) return c.json({ error: "Cannot block critical infrastructure" }, 403);

  const result = await services.protection.firewall.blockIp(payload.ip);
  return c.json(result);
};

export const firewallUnblockHandler = (services: ServiceContainer) => async (c: Context) => {
  const payload = await c.req.json();
  if (!payload.ip || !isValidIP(payload.ip)) return c.json({ error: "Invalid IP address" }, 400);

  const result = await services.protection.firewall.unblockIp(payload.ip);
  return c.json(result);
};

export const firewallFlushHandler = (services: ServiceContainer) => async (c: Context) => {
  const result = await services.protection.firewall.flushRules();
  return c.json(result);
};

export const firewallStatusHandler = (services: ServiceContainer) => async (c: Context) => {
  const result = await services.protection.firewall.getStatus();
  return c.json(result);
};

export const scannerScanHandler = (services: ServiceContainer) => async (c: Context) => {
  const { path, type } = await c.req.json();

  let result;
  if (type === 'ROOTKIT') {
      result = await services.protection.rkhunter.runScan();
  } else {
      result = await services.protection.antivirus.scanPath(path || "/home/");
  }

  const data = result.success ? (result as any).data : { success: false, error: (result as any).error?.message || "Unknown error" };

  const { recordScannerResult } = await import("../../../domain/analysis/metrics_service.ts");
  const scanStatus = (data.success && !data.threatsFound) ? "OK" : (data.threatsFound ? "THREAT_FOUND" : "SCAN_FAILED");
  recordScannerResult(new Date().toLocaleTimeString(), scanStatus);
  
  return c.json(data);
};

export const scannerSyncHandler = (services: ServiceContainer) => async (c: Context) => {
  const result = await services.protection.antivirus.syncSignatures();
  return c.json(result.success ? result.data : { success: false, error: (result as any).error?.message || "Sync failed" });
};

export const scannerLedgerHandler = (services: ServiceContainer) => async (c: Context) => {
  const ledger = await services.curatedIntel.getLedger({ type: "HASH", minScore: 90, limit: 50 });
  return c.json(ledger);
};
