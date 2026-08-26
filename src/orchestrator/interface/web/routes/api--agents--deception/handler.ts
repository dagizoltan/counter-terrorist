import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * The decoy manifest.
 *
 * Exists so the deception page can refresh its grid after a toggle instead of
 * doing `location.reload()`, which threw away scroll position and every other
 * island's state on the page.
 */
export const handlerFactory = (services: ServiceContainer) => (c: Context) => {
  const modules = services.deceptionGrid?.honeypot?.getModules() ?? [];
  return c.json(modules);
};
