import { Context } from "hono";
import { jsx } from "hono/jsx";

export const activeNetworkHandler = async (c: Context) => {
  const { ActiveNetworkPage } = await import("./active_page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(ActiveNetworkPage, { status, csrfToken, nonce, userRole }));
};

export const neighborNetworksHandler = async (c: Context) => {
  const { NeighborNetworksPage } = await import("./neighbors_page.tsx");
  const { status, csrfToken, nonce, userRole } = c.get("uiContext");
  return c.html(jsx(NeighborNetworksPage, { status, csrfToken, nonce, userRole }));
};
