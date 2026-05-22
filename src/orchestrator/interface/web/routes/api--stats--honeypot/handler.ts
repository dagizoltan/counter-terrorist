import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { EventBusPort } from "@core/ports.ts";

const honeypotHits: { timestamp: number; count: number }[] = [];
const WINDOW_MS = 10 * 60 * 1000;
let isSubscribed = false;

const subscribe = (eventBus: EventBusPort) => {
    if (isSubscribed) return;
    isSubscribed = true;

    eventBus.on("decoy", (data: any) => {
      if (data.event?.type === "PortAccess") {
        const now = Date.now();
        const interval = Math.floor(now / 10000) * 10000;

        const existing = honeypotHits.find(h => h.timestamp === interval);
        if (existing) {
          existing.count++;
        } else {
          honeypotHits.push({ timestamp: interval, count: 1 });
        }

        while (honeypotHits.length > 0 && honeypotHits[0].timestamp < now - WINDOW_MS) {
          honeypotHits.shift();
        }
      }
    });
};

export const handlerFactory = (services: ServiceContainer) => (c: Context) => {
  subscribe(services.eventBus);
  const now = Date.now();
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
};
