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

  // ── 01: SITUATIONAL AWARENESS ──────────────────────────────────────
  
  router.get("/", async (c: Context) => {
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const { Dashboard } = await import("../features/situational/dashboard/page.tsx") as any;
    return c.html(<Dashboard status={status} csrfToken={csrfToken} />);
  });

  router.get("/intel/map", async (c: Context) => {
     const { default: ThreatMapPage } = await import("../features/situational/intel/map.tsx") as any;
     const csrfToken = c.get("csrfToken");
     return c.html(<ThreatMapPage csrfToken={csrfToken} />);
  });

  router.get("/intel/news", async (c: Context) => {
    const { NewsPage } = await import("../features/situational/intel/news.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NewsPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/sysinfo", async (c: Context) => {
    const { SysInfoPage } = await import("../features/situational/sysinfo/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<SysInfoPage status={status} csrfToken={csrfToken} />);
  });

  // ── 02: INFRASTRUCTURE & FLEET ──────────────────────────────────────

  router.route("/agents", createAgentsRouter(getStatus));

  router.get("/network", async (c: Context) => {
    const { NetworkShieldPage } = await import("../features/infrastructure/network/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NetworkShieldPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/mesh", async (c: Context) => {
    const { MeshTopologyPage } = await import("../features/infrastructure/mesh/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<MeshTopologyPage status={status} csrfToken={csrfToken} />);
  });

  // ── 03: ACTIVE DEFENSE ──────────────────────────────────────────────

  router.route("/honeypots", createHoneypotsRouter(services.honeypot));

    router.get("/threats", async (c: Context) => {
      const { ThreatsPage } = await import("../features/defense/threats/page.tsx") as any;
      const status = await getStatus();
      const csrfToken = c.get("csrfToken");
      return c.html(<ThreatsPage status={status} csrfToken={csrfToken} />);
    });
  
    router.get("/events", async (c: Context) => {
      const { EventsPage } = await import("../features/defense/threats/events/page.tsx") as any;
      const csrfToken = c.get("csrfToken");
      return c.html(<EventsPage csrfToken={csrfToken} />);
    });

  // ── 04: FORENSICS & AUDIT ───────────────────────────────────────────

  router.route("/audit", createAuditRouter());

  router.get("/processes", async (c: Context) => {
    const { ProcessesPage } = await import("../features/forensic/processes/page.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<ProcessesPage csrfToken={csrfToken} />);
  });

  router.get("/analysis/timeline", async (c: Context) => {
    const { TimelinePage } = await import("../features/forensic/timeline/timeline.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<TimelinePage csrfToken={csrfToken} />);
  });

  router.get("/analysis/replay", async (c: Context) => {
    const { default: ForensicReplay } = await import("../features/forensic/timeline/replay.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<ForensicReplay csrfToken={csrfToken} />);
  });

  // ── 05: GOVERNANCE & POLICY ────────────────────────────────────────

  router.get("/settings", async (c: Context) => {
    const { NotificationsPage } = await import("../features/governance/settings/notifications.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NotificationsPage status={status} csrfToken={csrfToken} />);
  });

  // Compliance Map (Legacy support & categorization)
  router.get("/compliance/audit", async (c) => {
    const { AuditPage } = await import("../features/forensic/audit/page.tsx") as any;
    const csrfToken = c.get("csrfToken");
    return c.html(<AuditPage csrfToken={csrfToken} />);
  });

  router.get("/supply-chain", async (c) => {
    const { SupplyChainPage } = await import("../features/governance/supply_chain/page.tsx") as any;
    const sbom = services.supplyChain.getSBOM();
    const healthScore = services.supplyChain.getHealthScore();
    const csrfToken = c.get("csrfToken");
    return c.html(<SupplyChainPage sbom={sbom} healthScore={healthScore} csrfToken={csrfToken} />);
  });

  return router;
}
