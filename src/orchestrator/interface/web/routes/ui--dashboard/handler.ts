import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { Dashboard } = await import("../../features/situational/dashboard/page.tsx");
  const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
  return c.html(jsx(Dashboard, { status, csrfToken, nonce, hostname, userRole }) as unknown as string);
};
