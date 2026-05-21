import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { ActiveNetworkPage } = await import("../../features/infrastructure/network/active_page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ActiveNetworkPage, { status, csrfToken, nonce, userRole }) as unknown as string);
};
