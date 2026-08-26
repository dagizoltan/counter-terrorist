import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * What this host is listening on, and which of it is deliberate.
 *
 * The console could open and close ports from the day it shipped — arming a
 * decoy calls allowPort, morphing calls both — but nothing ever reported the
 * result, so there was no way to confirm a port opened, notice one that stayed
 * open, or see a listener nobody meant to expose.
 *
 * Decoy ports are labelled here rather than in the view: the honeypot manifest
 * is the only thing that knows which listeners are traps.
 */
export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const firewall = services.protection.firewall;

  if (!firewall.listListeningPorts) {
    return c.json({ supported: false, ports: [], decoys: [] });
  }

  const ports = await firewall.listListeningPorts();
  const modules = services.deceptionGrid?.honeypot?.getModules() ?? [];
  const decoyByPort = new Map(modules.map((m) => [m.port, m]));

  return c.json({
    supported: true,
    ports: ports.map((p) => {
      const decoy = decoyByPort.get(p.port);
      return {
        ...p,
        decoy: decoy ? { id: decoy.id, name: decoy.name, active: decoy.active } : null,
      };
    }),
    // Armed decoys whose port is not listening are worth surfacing: the module
    // says armed, the host disagrees.
    decoys: modules
      .filter((m) => m.active && !ports.some((p) => p.port === m.port))
      .map((m) => ({ id: m.id, name: m.name, port: m.port })),
  });
};
