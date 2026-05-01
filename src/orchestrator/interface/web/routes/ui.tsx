import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { SecurityMiddleware } from "../middleware/security.ts";
import { ServiceContainer } from "@core/container.ts";
import { createAgentsRouter } from "../features/agents/handler.tsx";
import { createAuditRouter } from "../features/audit/handler.tsx";
import { createHoneypotsRouter } from "../features/honeypots/handler.tsx";
import { FeedPage } from "../features/threats/FeedPage.tsx";
import { IdentifiedPage } from "../features/threats/IdentifiedPage.tsx";
import { LogsPage } from "../features/compliance/LogsPage.tsx";
import { NetworkPage } from "../features/compliance/NetworkPage.tsx";
import { AuditPage } from "../features/compliance/AuditPage.tsx";
import { IncidentsPage } from "../features/compliance/IncidentsPage.tsx";

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
    const { NetworkShieldPage } = await import("../features/network/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NetworkShieldPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/mesh", async (c: Context) => {
    const { MeshTopologyPage } = await import("../features/mesh/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<MeshTopologyPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/threats", async (c: Context) => {
    const { ThreatsPage } = await import("../features/threats/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<ThreatsPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/events", async (c: Context) => {
    const { EventsPage } = await import("../features/events/page.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<EventsPage csrfToken={csrfToken} />);
  });

  router.get("/processes", async (c: Context) => {
    const { ProcessesPage } = await import("../features/processes/page.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<ProcessesPage csrfToken={csrfToken} />);
  });

  router.get("/sysinfo", async (c: Context) => {
    const { SysInfoPage } = await import("../features/sysinfo/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<SysInfoPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/settings", async (c: Context) => {
    const { NotificationsPage } = await import("../features/settings/notifications.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NotificationsPage status={status} csrfToken={csrfToken} />);
  });

  // Sub-routes for forensics and intel
  router.get("/intel/map", async (c: Context) => {
     const { default: ThreatMapPage } = await import("../features/intel/map.tsx") as any;
     return c.html(<ThreatMapPage />);
  });

  router.get("/analysis/timeline", async (c: Context) => {
     const { TimelinePage } = await import("../features/analysis/timeline.tsx") as any;
     return c.html(<TimelinePage />);
  });

  router.get("/analysis/replay", async (c: Context) => {
    const { default: ForensicReplay } = await import("../features/analysis/replay.tsx") as any;
    return c.html(<ForensicReplay />);
  });

  router.get("/audit/integrity", async (c: Context) => {
    const { default: AuditIntegrity } = await import("../features/audit/integrity.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<AuditIntegrity status={status} csrfToken={csrfToken} />);
  });

  // Threat Protection
  router.get("/threats/feed", (c) => c.html(<FeedPage />));
  router.get("/threats/identified", (c) => c.html(<IdentifiedPage />));

  // Compliance
  router.get("/compliance/logs", (c) => c.html(<LogsPage />));
  router.get("/compliance/network", (c) => c.html(<NetworkPage />));
  router.get("/compliance/audit", (c) => c.html(<AuditPage />));
  router.get("/compliance/incidents", (c) => c.html(<IncidentsPage />));

  return router;
}
