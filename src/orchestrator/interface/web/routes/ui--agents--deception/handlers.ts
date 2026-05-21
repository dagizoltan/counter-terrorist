import { Context } from "hono";
import { jsx } from "hono/jsx";
import { DeceptionGridService } from "@domain/protection/deception_grid.ts";

export const honeypotsHandler = (honeypot: DeceptionGridService) => async (c: Context) => {
  const { HoneypotsPage } = await import("./page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  const modules = await (honeypot as any).honeypot?.getModules?.() || [];
  return c.html(jsx(HoneypotsPage, { modules, status, csrfToken, nonce, userRole }) as any);
};
