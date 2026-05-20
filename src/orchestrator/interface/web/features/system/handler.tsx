import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";

export function createSystemRouter() {
  const router = new Hono();

  router.get("/info", async (c: Context) => {
    const { SystemInfoPage } = await import("./info_page.tsx");
    const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
    return c.html(<SystemInfoPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} userRole={userRole} />);
  });

  router.get("/supply-chain", async (c: Context) => {
    const { SupplyChainPage } = await import("./supply_chain_page.tsx");
    const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
    return c.html(<SupplyChainPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} userRole={userRole} />);
  });

  router.get("/ledger", async (c: Context) => {
    // Note: audit is technically under forensic but routed under /system in the original ui.tsx
    const { AuditPage } = await import("../forensic/audit/page.tsx") as any;
    const { csrfToken, nonce, hostname, userRole } = c.get("uiContext");
    return c.html(<AuditPage csrfToken={csrfToken} nonce={nonce} hostname={hostname} userRole={userRole} />);
  });

  router.get("/settings", async (c: Context) => {
    const { NotificationsPage } = await import("../governance/settings/notifications.tsx") as any;
    const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
    return c.html(<NotificationsPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} userRole={userRole} />);
  });

  return router;
}
