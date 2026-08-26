import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { IntelEnricher } from "@domain/analysis/intel_enricher.ts";
import type { NetworkDevice } from "@domain/analysis/network_discovery.ts";

/**
 * One discovered network participant, in detail.
 *
 * The neighbours grid can list every ambient signal but has nowhere to send an
 * operator who wants to act on a single one. This resolves a device by the same
 * id the grid links with, so the ids always line up:
 *
 *   - WiFi APs are keyed `WIFI_<mac>`, Bluetooth `BT_<mac>`, mesh peers by their
 *     node id, and ethernet neighbours by bare mac (they carry no synthetic id),
 *     so a match is `d.id === id || d.mac === id`.
 *
 * The device set is rebuilt exactly as api--network--discovery builds it —
 * getDevices() for the three ambient vectors, plus the verified mesh roster —
 * rather than read from a second source that could drift from the list.
 *
 * The trust heuristic that used to live in the island (EnvironmentalSignals'
 * renderSignalCard) is computed here instead, so the grid card and this page
 * cannot disagree on the same device's score.
 */

function buildInventory(services: ServiceContainer): NetworkDevice[] {
  const devices = services.networkDiscovery.getDevices();
  const wifi = devices.filter((d) => d.type === "WIFI");
  const bluetooth = devices.filter((d) => d.type === "BLUETOOTH");
  const ethernet = devices.filter((d) => d.type === "ETHERNET");

  const mesh = services.mesh.getNodes().filter((n) => n.verified).map((n) => ({
    id: n.id || n.hostname,
    hostname: n.hostname,
    mac: n.id,
    ip: n.address,
    isMeshNode: true,
    isLocal: false,
    lastSeen: new Date(n.lastSeen).toISOString(),
    state: "REACHABLE",
    type: "MESH" as const,
  }));

  return [...wifi, ...bluetooth, ...ethernet, ...mesh] as NetworkDevice[];
}

/** The same 10–99 score the grid card shows, kept in one place. */
function trustScore(d: NetworkDevice & { publicIntel?: string }): number {
  if (d.type === "MESH") return 99;
  let score = 85;
  if (d.publicIntel?.includes("Randomized")) score -= 30;
  if (d.publicIntel?.includes("Unknown")) score -= 15;
  if (typeof d.signal === "number" && d.signal < -80) score -= 10;
  return Math.max(10, Math.min(99, score));
}

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const id = c.req.param("id");

  const inventory = buildInventory(services);
  const match = inventory.find((d) => d.id === id || d.mac === id);

  if (!match) {
    // A live inventory: a device that was on the grid a moment ago can drop off
    // between the click and this read. 404 so the island can say so plainly
    // rather than render a shell around nothing.
    return c.json({ success: false, error: `No participant matches '${id}' in the current sweep` }, 404);
  }

  const [device] = IntelEnricher.enrichDevices([match]);

  // Which of this participant's addresses is actually being enforced — the
  // operator's real question before acting on it.
  const blockedIps = new Set(
    await services.protection.firewall.getBlockedIps().catch(() => [] as string[]),
  );

  return c.json({
    device,
    vector: device.type,
    trust: trustScore(device),
    blocked: !!device.ip && blockedIps.has(device.ip),
    canEnforce: !!device.ip,
  });
};
