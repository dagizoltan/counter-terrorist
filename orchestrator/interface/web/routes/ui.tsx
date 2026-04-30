import { Hono, Context } from "hono";
import { jsx } from "hono/jsx";
import { SecurityMiddleware } from "../middleware/security.ts";
import { ServiceContainer } from "../../../core/container.ts";
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
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const { Dashboard } = await import("../features/dashboard/page.tsx");
    return c.html(<Dashboard status={status} csrfToken={csrfToken} />);
  });

  // Feature Pages
  router.route("/agents", createAgentsRouter(getStatus));
  router.route("/audit", createAuditRouter());
  router.route("/honeypots", createHoneypotsRouter(services.honeypot));

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
     const { ThreatMapPage } = await import("../features/intel/map.tsx");
     return c.html(<ThreatMapPage />);
  });

  router.get("/forensics/timeline", async (c: Context) => {
     const { TimelinePage } = await import("../features/forensics/timeline.tsx");
     return c.html(<TimelinePage />);
  });

  router.get("/forensics/replay", async (c: Context) => {
    const { default: ForensicReplay } = await import("../features/forensics/replay.tsx");
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
