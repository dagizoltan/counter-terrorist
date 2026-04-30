import { Hono, Context } from "hono";
import { EventBusPort } from "../../../core/ports.ts";

export function createStatsApi(eventBus: EventBusPort) {
  const router = new Hono();

  // In-memory hit counter for honeypot
  const honeypotHits: { timestamp: number; count: number }[] = [];
  const WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  // Subscribe to honeypot events
  eventBus.on("honeypot", (data) => {
    if (data.event?.type === "PortAccess") {
      const now = Date.now();
      const last = honeypotHits[honeypotHits.length - 1];
      
      // Group by 10s intervals
      const interval = Math.floor(now / 10000) * 10000;
      
      const existing = honeypotHits.find(h => h.timestamp === interval);
      if (existing) {
        existing.count++;
      } else {
        honeypotHits.push({ timestamp: interval, count: 1 });
      }

      // Cleanup old data
      while (honeypotHits.length > 0 && honeypotHits[0].timestamp < now - WINDOW_MS) {
        honeypotHits.shift();
      }
    }
  });

  router.get("/honeypot", (c: Context) => {
    const now = Date.now();
    // Fill gaps with 0s for a smooth graph
    const data = [];
    for (let t = now - WINDOW_MS; t <= now; t += 10000) {
      const interval = Math.floor(t / 10000) * 10000;
      const hit = honeypotHits.find(h => h.timestamp === interval);
      data.push({
        time: new Date(interval).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        hits: hit ? hit.count : 0
      });
    }
    return c.json(data);
  });

  return router;
}
