import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";

export function createNetworkRouter() {
  const router = new Hono();

  router.get("/", (c) => c.redirect("/network/active"));

  router.get("/active", async (c: Context) => {
    const { ActiveNetworkPage } = await import("./active_page.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<ActiveNetworkPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  router.get("/neighbors", async (c: Context) => {
    const { NeighborNetworksPage } = await import("./neighbors_page.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<NeighborNetworksPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  return router;
}
