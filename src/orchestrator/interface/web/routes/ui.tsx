import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { SecurityMiddleware } from "../middleware/security.ts";
import { ServiceContainer } from "@core/container.ts";

/* Categorized Feature Routers */
import { createAgentsRouter } from "../features/infrastructure/agents/handler.tsx";
import { createAuditRouter } from "../features/forensic/audit/handler.tsx";
import { createHoneypotsRouter } from "../features/defense/deception/handler.tsx";

/**
 * UI Router
 * Optimized for Operational Security (OpSec) Flow.
 */
export function createUiRouter(services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<any>) {
  const router = new Hono();

  // Root RBAC Enforcement
  router.use("*", security.requireRole("admin", "operator", "viewer"));

  // ── MONITOR (Mission Control & Global Status) ─────────────────────
  
  router.get("/", (c) => c.redirect("/dashboard"));

  router.get("/dashboard", async (c: Context) => {
    const { Dashboard } = await import("../features/situational/dashboard/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<Dashboard status={status} csrfToken={csrfToken} />);
  });

  router.get("/infrastructure", async (c: Context) => {
    const { SysInfoPage } = await import("../features/situational/sysinfo/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<SysInfoPage status={status} csrfToken={csrfToken} />);
  });

  // ── ANALYZE (Tactical Intelligence) ───────────────────────────────

  router.get("/intelligence", async (c: Context) => {
    const { IntelligenceCenterPage } = await import("../features/situational/intel/IntelligenceCenter.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<IntelligenceCenterPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/forensics", async (c: Context) => {
    const { ForensicCenterPage } = await import("../features/forensic/ForensicCenter.tsx");
    const csrfToken = c.get("csrfToken");
    return c.html(<ForensicCenterPage csrfToken={csrfToken} />);
  });

  // ── ENFORCE (Active Enforcement) ──────────────────────────────────

  router.get("/network", async (c: Context) => {
    const { NetworkShieldPage } = await import("../features/infrastructure/network/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NetworkShieldPage status={status} csrfToken={csrfToken} />);
  });

  router.route("/deception", createHoneypotsRouter(services.honeypot));

  router.route("/agents", createAgentsRouter(getStatus));

  // ── ADMINISTRATION (Governance & Settings) ────────────────────────

  router.get("/governance", async (c: Context) => {
    const { AuditPage } = await import("../features/forensic/audit/page.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<AuditPage csrfToken={csrfToken} />);
  });

  router.get("/settings", async (c: Context) => {
    const { NotificationsPage } = await import("../features/governance/settings/notifications.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NotificationsPage status={status} csrfToken={csrfToken} />);
  });

  return router;
}
