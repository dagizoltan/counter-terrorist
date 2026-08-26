import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * Deploy or kill one decoy module.
 *
 * HoneypotService.toggleModule() has always existed, but nothing exposed it
 * over HTTP: the deception page posted to `/agents/deception/api/:id/toggle`,
 * a path with no route behind it. The button was dead twice over — that URL
 * 404'd, and the inline onclick that called it was blocked by the CSP.
 */
export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const id = c.req.param("id");
  const honeypot = services.deceptionGrid?.honeypot;

  if (!honeypot) {
    return c.json({ success: false, error: "Deception grid is not running" }, 503);
  }

  let active: unknown;
  try {
    ({ active } = await c.req.json());
  } catch {
    return c.json({ success: false, error: "Body must be JSON" }, 400);
  }

  if (typeof active !== "boolean") {
    return c.json({ success: false, error: "`active` must be a boolean" }, 400);
  }

  // Reject an unknown id before touching the firewall: toggleModule opens or
  // closes a port, and the id decides which one.
  if (!honeypot.getModule(id)) {
    return c.json({ success: false, error: `Unknown decoy module '${id}'` }, 404);
  }

  const result = await honeypot.toggleModule(id, active);
  if (!result.success) {
    return c.json({ success: false, error: result.error.message }, 500);
  }

  return c.json({ id, active });
};
