import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { SecurityMiddleware } from "../middleware/security.ts";
import { ServiceContainer } from "@core/container.ts";
import { createAgentsRouter } from "../features/agents/handler.tsx";
import { createAuditRouter } from "../features/audit/handler.tsx";
import { createHoneypotsRouter } from "../features/honeypots/handler.tsx";

/**
 * UI Router
 * Handles all browser-facing pages.
 */
export function createUiRouter(services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<any>) {
  const router = new Hono();

  // Root RBAC Enforcement
  router.use("*", security.requireRole("admin", "operator", "viewer"));

  // Dashboard
  router.get("/", async (c: Context) => {
    console.log("[WEB:UI] Rendering Dashboard...");
    const status = await getStatus();
    console.log("[WEB:UI] Status aggregated.");
    const csrfToken = c.get("csrfToken");
    console.log("[WEB:UI] Importing DashboardPage component...");
    const { Dashboard: DashboardPage } = await import("../features/dashboard/page.tsx") as any;
    console.log("[WEB:UI] Rendering HTML...");
    const html = c.html(<DashboardPage status={status} csrfToken={csrfToken} />);
    console.log("[WEB:UI] HTML render complete.");
    return html;
  });

  // Feature Pages
  router.route("/agents", createAgentsRouter(getStatus));
  router.route("/audit", createAuditRouter());
  router.route("/honeypots", createHoneypotsRouter(services.honeypot));

  router.get("/network", async (c: Context) => {
    const { NetworkShieldPage } = await import("../features/network/page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NetworkShieldPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/mesh", async (c: Context) => {
    const { MeshTopologyPage } = await import("../features/mesh/page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<MeshTopologyPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/threats", async (c: Context) => {
    const { ThreatsPage } = await import("../features/threats/page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<ThreatsPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/events", async (c: Context) => {
    const { EventsPage } = await import("../features/events/page.tsx");
    const csrfToken = c.get("csrfToken");
    return c.html(<EventsPage csrfToken={csrfToken} />);
  });

  router.get("/processes", async (c: Context) => {
    const { ProcessesPage } = await import("../features/processes/page.tsx");
    const csrfToken = c.get("csrfToken");
    return c.html(<ProcessesPage csrfToken={csrfToken} />);
  });

  router.get("/sysinfo", async (c: Context) => {
    const { SysInfoPage } = await import("../features/sysinfo/page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<SysInfoPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/settings", async (c: Context) => {
    const { NotificationsPage } = await import("../features/settings/notifications.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NotificationsPage status={status} csrfToken={csrfToken} />);
  });

  // Sub-routes for forensics and intel
  router.get("/intel/map", async (c: Context) => {
     const { default: ThreatMapPage } = await import("../features/intel/map.tsx");
     return c.html(<ThreatMapPage />);
  });

  router.get("/analysis/timeline", async (c: Context) => {
     const { TimelinePage } = await import("../features/analysis/timeline.tsx");
     return c.html(<TimelinePage />);
  });

  router.get("/analysis/replay", async (c: Context) => {
    const { default: ForensicReplay } = await import("../features/analysis/replay.tsx");
    return c.html(<ForensicReplay />);
  });

  router.get("/audit/integrity", async (c: Context) => {
    const { default: AuditIntegrity } = await import("../features/audit/integrity.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<AuditIntegrity status={status} csrfToken={csrfToken} />);
  });

  return router;
}
