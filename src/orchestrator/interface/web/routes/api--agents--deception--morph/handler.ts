import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";

/**
 * Rotate the decoy port signatures.
 *
 * Backs the "Morph Decoy Signatures" control, which was a button with no
 * handler and no endpoint. HoneypotService.morph() already implemented it.
 */
export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  const honeypot = services.deceptionGrid?.honeypot;
  if (!honeypot) {
    return c.json({ success: false, error: "Deception grid is not running" }, 503);
  }

  const result = await honeypot.morph();
  if (!result.success) {
    return c.json({ success: false, error: result.error.message }, 500);
  }

  return c.json({ morphed: true, modules: honeypot.getModules() });
};
