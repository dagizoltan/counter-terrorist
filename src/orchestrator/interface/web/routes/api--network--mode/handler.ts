import { Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { StealthMode } from "@domain/protection/anonymization_service.ts";

/**
 * Select the stealth mode.
 *
 * The mode was previously forwarded to setMode() as whatever string arrived,
 * so an unknown value was stored as the active mode and every later
 * `switch (this.mode)` in rotate() fell through to no branch — the service
 * reported a mode it could not act on.
 */
const MODES = new Set(Object.values(StealthMode) as string[]);

export const handlerFactory = (services: ServiceContainer) => async (c: Context) => {
  let body: { mode?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Body must be JSON" }, 400);
  }

  if (typeof body.mode !== "string" || !MODES.has(body.mode)) {
    return c.json({
      success: false,
      error: `\`mode\` must be one of: ${[...MODES].join(", ")}`,
    }, 400);
  }

  const result = await services.anonymization.setMode(body.mode as StealthMode);
  if (result && result.success === false) {
    return c.json({ success: false, error: result.error.message }, 500);
  }

  return c.json({ mode: body.mode });
};
