import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { csrfToken, nonce, userRole } = c.get("uiContext");
  const id = c.req.param("id");
  const { NetworkDetailPage } = await import("./page.tsx");
  // The shell renders for any id. The discovered set is live and can change
  // between the grid click and this request, so resolution is left to the
  // island against /api/network/neighbors/:id, which reports a clean
  // "no longer visible" state instead of a hard server 404.
  return c.html(jsx(NetworkDetailPage, { id, csrfToken, nonce, userRole }) as unknown as string);
};
