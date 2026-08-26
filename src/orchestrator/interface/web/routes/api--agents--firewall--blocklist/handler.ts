import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * The active enforcement ledger.
 *
 * The console's blocked-IP list used to be assembled client-side from two
 * unreliable sources: metrics.firewall.blockedIps, which emitMetrics caps at
 * .slice(0, 20), and — when that came back empty — a regex over the raw
 * iptables stdout looking for anything shaped like an IPv4 address on a line
 * containing DROP/REJECT/DENY. That found no IPv6, silently truncated at 20,
 * and could never show why an address was blocked.
 *
 * The real record has been in KV the whole time. This returns it.
 */
export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const firewall = services.protection.firewall;
  const now = Date.now();

  // A provider without a ledger still knows what it is enforcing; degrade to
  // the bare set rather than reporting an empty perimeter.
  const ledger = firewall.getEnforcementLedger
    ? await firewall.getEnforcementLedger()
    : (await firewall.getBlockedIps()).map((ip) => ({
      ip,
      reason: null,
      committedAt: null,
      expiresAt: null,
      persisted: false,
    }));

  return c.json({
    now,
    entries: ledger.map((entry) => ({
      ...entry,
      // Negative means the TTL has lapsed and the entry is awaiting the next
      // lifecycle audit, which re-verifies it and then extends or purges.
      expiresInMs: entry.expiresAt === null ? null : entry.expiresAt - now,
    })),
  });
};
