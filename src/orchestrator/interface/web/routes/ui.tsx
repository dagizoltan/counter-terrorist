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

  // ── PHASE_01: OVERWATCH (Strategic Core) ──────────────────────────
  
  router.get("/", async (c: Context) => {
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

  router.get("/governance", async (c: Context) => {
    const { AuditPage } = await import("../features/forensic/audit/page.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<AuditPage csrfToken={csrfToken} />);
  });

  // Overwatch Aliases
  router.get("/sysinfo", (c) => c.redirect("/infrastructure"));
  router.get("/supply-chain", (c) => c.redirect("/infrastructure"));
  router.get("/compliance/audit", (c) => c.redirect("/governance"));

  // ── PHASE_02: SIGNAL (Tactical Intelligence) ─────────────────────

  router.get("/intelligence", async (c: Context) => {
    const { IntelligenceCenterPage } = await import("../features/situational/intel/IntelligenceCenter.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<IntelligenceCenterPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/investigation", async (c: Context) => {
    const { ForensicCenterPage } = await import("../features/forensic/ForensicCenter.tsx");
    const csrfToken = c.get("csrfToken");
    return c.html(<ForensicCenterPage csrfToken={csrfToken} />);
  });

  // Signal Aliases
  router.get("/threats", (c) => c.redirect("/intelligence"));
  router.get("/forensics/investigation", (c) => c.redirect("/investigation"));

  // ── PHASE_03: STRIKE (Active Enforcement) ────────────────────────

  router.get("/perimeter", async (c: Context) => {
    const { NetworkShieldPage } = await import("../features/infrastructure/network/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NetworkShieldPage status={status} csrfToken={csrfToken} />);
  });

  router.route("/deception", createHoneypotsRouter(services.honeypot));

  router.route("/agents", createAgentsRouter(getStatus));

  // Strike Aliases
  router.get("/network", (c) => c.redirect("/perimeter"));
  router.get("/honeypots", (c) => c.redirect("/deception"));
  router.get("/mesh", (c) => c.redirect("/perimeter"));

  // ── SUPPORT ──────────────────────────────────────────────────────

  router.get("/settings", async (c: Context) => {
    const { NotificationsPage } = await import("../features/governance/settings/notifications.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NotificationsPage status={status} csrfToken={csrfToken} />);
  });

  return router;
}
