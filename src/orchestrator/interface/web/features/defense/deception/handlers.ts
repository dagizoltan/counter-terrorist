import { Context } from "hono";
import { jsx } from "hono/jsx";
import { DeceptionGridService } from "@domain/protection/deception_grid.ts";

export const honeypotsHandler = (honeypot: DeceptionGridService) => async (c: Context) => {
  const { DeceptionGridPage } = await import("./page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(DeceptionGridPage, { status, csrfToken, nonce, userRole }));
};
