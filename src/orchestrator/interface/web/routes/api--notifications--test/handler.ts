import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * Deliver a test notification to every configured webhook.
 *
 * Backs the console's "TEST_ALL" button, which previously fetched
 * /api/infrastructure/system/protection/firewall/status — a path no route
 * serves — and reported "TEST SENT" whatever came back, since a 404 resolves
 * rather than throwing.
 */
export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const results = await services.notifications.sendTest();
  return c.json({
    total: results.length,
    delivered: results.filter((r) => r.delivered).length,
    results,
  });
};
