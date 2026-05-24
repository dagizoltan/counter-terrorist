import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { IntelEnricher } from "@domain/analysis/intel_enricher.ts";

export const handlerFactory = (services: ServiceContainer) => (c: Context) => {
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
