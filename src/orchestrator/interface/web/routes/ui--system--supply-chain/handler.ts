import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { SupplyChainPage } = await import("./page.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(SupplyChainPage, { status, csrfToken, nonce, hostname, userRole }) as unknown as string);
};
