import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { IntelEnricher } from "@domain/analysis/intel_enricher.ts";

export const networkDiscoveryHandler = (services: ServiceContainer) => async (c: Context) => {
  const devices = services.networkDiscovery.getDevices();

  const wifi = devices.filter(d => d.type === "WIFI");
  const bluetooth = devices.filter(d => d.type === "BLUETOOTH");
  const ethernet = devices.filter(d => d.type === "ETHERNET");

  const mesh = services.mesh.getNodes().filter(n => n.verified).map(n => ({
      id: n.id || n.hostname,
      hostname: n.hostname,
      mac: n.id,
      ip: n.address,
      isMeshNode: true,
      type: "MESH",
      state: "REACHABLE",
      lastSeen: new Date(n.lastSeen).toISOString()
  }));

  const enriched = {
      wifi: IntelEnricher.enrichDevices(wifi),
      bluetooth: IntelEnricher.enrichDevices(bluetooth),
      ethernet: IntelEnricher.enrichDevices(ethernet),
      mesh: IntelEnricher.enrichDevices(mesh)
  };

  return c.json(enriched);
};

export const networkLogsHandler = (services: ServiceContainer) => async (c: Context) => {
  const logs = await services.networkLogs.getRecent(50);
  return c.json(logs);
};

export const rotateIdentityHandler = (services: ServiceContainer) => async (c: Context) => {
  await services.anonymization.rotate();
  return c.json({ success: true, message: "Identity rotation initiated" });
};

export const setStealthModeHandler = (services: ServiceContainer) => async (c: Context) => {
  const { mode } = await c.req.json();
  if (!mode) return c.json({ error: "Mode required" }, 400);
  await services.anonymization.setMode(mode);
  return c.json({ success: true, message: `Stealth mode set to ${mode}` });
};
