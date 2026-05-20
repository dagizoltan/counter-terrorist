import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";

export function createSituationalRouter() {
  const router = new Hono();

  router.get("/dashboard", async (c: Context) => {
    const { Dashboard } = await import("./dashboard/page.tsx") as any;
    const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
    return c.html(<Dashboard status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} userRole={userRole} />);
  });

  router.get("/infrastructure", async (c: Context) => {
    const { SysInfoPage } = await import("./sysinfo/page.tsx") as any;
    const { status, csrfToken, nonce, hostname, userRole } = c.get("uiContext");
    return c.html(<SysInfoPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} userRole={userRole} />);
  });

  router.get("/intel/map", async (c: Context) => {
    const { ThreatMapPage } = await import("./intel/ThreatMapPage.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<ThreatMapPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  router.get("/intel/feed", async (c: Context) => {
    const { NewsPage: OperationalNewsPage } = await import("./intel/OperationalNewsPage.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<OperationalNewsPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  return router;
}
