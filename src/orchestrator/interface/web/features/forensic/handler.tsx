import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";

export function createForensicRouter() {
  const router = new Hono();

  router.get("/", async (c: Context) => {
    const { ForensicCenterPage } = await import("./ForensicCenter.tsx");
    const { csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<ForensicCenterPage csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  router.get("/compliance", async (c: Context) => {
    const { ComplianceCenterPage } = await import("./compliance/ComplianceCenter.tsx") as any;
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<ComplianceCenterPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  return router;
}
