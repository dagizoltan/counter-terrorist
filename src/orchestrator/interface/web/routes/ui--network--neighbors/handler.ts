import { Context } from "hono";
import { jsx } from "hono/jsx";

export const handler = async (c: Context) => {
  const { NeighborNetworksPage } = await import("../../features/infrastructure/network/neighbors_page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(NeighborNetworksPage, { status, csrfToken, nonce, userRole }) as unknown as string);
};
