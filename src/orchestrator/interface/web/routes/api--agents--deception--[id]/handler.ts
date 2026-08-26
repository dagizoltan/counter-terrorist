import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import type { LogEntry } from "@core/ports.ts";

/**
 * One decoy, with the activity attributable to it.
 *
 * HoneypotService already tags everything it logs with `decoy:<module id>`:
 * a PortAccess hit carries { source_ip, port, module }, and a SessionData
 * entry carries { source_ip, port, data } — the attacker's own session
 * transcript, hard-capped at 16KB by the service. Until now none of it was
 * reachable: the console could arm and disarm a decoy but never see what the
 * decoy caught.
 *
 * getHitCount() is a single global counter, so per-module counts are derived
 * here from the tagged log entries rather than read from the service.
 */

const MAX_LOG_SCAN = 500;
const MAX_HITS = 50;
const MAX_TRANSCRIPTS = 20;

/** A payload shaped like what HoneypotService writes for this module. */
const payloadOf = (entry: LogEntry): Record<string, unknown> =>
  (entry.payload && typeof entry.payload === "object" ? entry.payload : {}) as Record<string, unknown>;

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const id = c.req.param("id");
  const honeypot = services.deceptionGrid?.honeypot;

  if (!honeypot) {
    return c.json({ success: false, error: "Deception grid is not running" }, 503);
  }

  const decoy = honeypot.getModule(id);
  if (!decoy) {
    return c.json({ success: false, error: `Unknown decoy module '${id}'` }, 404);
  }

  const entries = await services.audit.getLogging().getRecentLogs(MAX_LOG_SCAN)
    .catch(() => [] as LogEntry[]);

  const mine = entries.filter((e) => e.caller === `decoy:${id}`);

  const hits = mine
    .filter((e) => typeof payloadOf(e).source_ip === "string" && payloadOf(e).data === undefined)
    .map((e) => {
      const p = payloadOf(e);
      return { timestamp: e.timestamp, sourceIp: String(p.source_ip), port: p.port ?? decoy.port };
    })
    .slice(0, MAX_HITS);

  const transcripts = mine
    .filter((e) => typeof payloadOf(e).data === "string")
    .map((e) => {
      const p = payloadOf(e);
      return { timestamp: e.timestamp, sourceIp: String(p.source_ip ?? "unknown"), data: String(p.data) };
    })
    .slice(0, MAX_TRANSCRIPTS);

  // Which of the addresses this decoy caught are actually being enforced —
  // the operator's real question is "did we act on this one".
  const blocked = new Set(await services.protection.firewall.getBlockedIps().catch(() => []));

  const seen = new Map<string, { sourceIp: string; hits: number; lastSeen: string; blocked: boolean }>();
  for (const hit of hits) {
    const existing = seen.get(hit.sourceIp);
    if (existing) {
      existing.hits++;
      // Entries arrive newest first, so the first timestamp is the latest.
      continue;
    }
    seen.set(hit.sourceIp, {
      sourceIp: hit.sourceIp,
      hits: 1,
      lastSeen: hit.timestamp,
      blocked: blocked.has(hit.sourceIp),
    });
  }

  return c.json({
    module: decoy,
    hitCount: hits.length,
    scanned: entries.length,
    truncated: entries.length >= MAX_LOG_SCAN,
    sources: [...seen.values()].sort((a, b) => b.hits - a.hits),
    hits,
    transcripts,
  });
};
