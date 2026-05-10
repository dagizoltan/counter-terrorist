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
    const nonce = c.get("nonce");
    const hostname = Deno.hostname();
    return c.html(<Dashboard status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} />);
  });

  router.get("/infrastructure", async (c: Context) => {
    const { SysInfoPage } = await import("../features/situational/sysinfo/page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    const hostname = Deno.hostname();
    return c.html(<SysInfoPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} />);
  });

  // ── ANALYZE (Tactical Intelligence) ───────────────────────────────

  router.get("/forensics", async (c: Context) => {
    const { ForensicCenterPage } = await import("../features/forensic/ForensicCenter.tsx");
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<ForensicCenterPage csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/compliance", async (c: Context) => {
    const { ComplianceCenterPage } = await import("../features/forensic/compliance/ComplianceCenter.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<ComplianceCenterPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/infrastructure/mesh", async (c: Context) => {
    const { MeshTopologyPage } = await import("../features/infrastructure/mesh/page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<MeshTopologyPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/intel/public-ip-collections", async (c: Context) => {
    const { default: IpIntelPage } = await import("../features/defense/ip_intel_page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<IpIntelPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/intel/artifact-collections", async (c: Context) => {
    const { default: ArtifactIntelPage } = await import("../features/defense/artifact_intel_page.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<ArtifactIntelPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/intel/map", async (c: Context) => {
    const { ThreatMapPage } = await import("../features/situational/intel/ThreatMapPage.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<ThreatMapPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/intel/feed", async (c: Context) => {
    const { NewsPage: OperationalNewsPage } = await import("../features/situational/intel/OperationalNewsPage.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<OperationalNewsPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  // ── NETWORK (Refactored Group) ───────────────────────────────────

  router.get("/network/active", async (c: Context) => {
    const { ActiveNetworkPage } = await import("../features/infrastructure/network/active_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<ActiveNetworkPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/network/neighbors", async (c: Context) => {
    const { NeighborNetworksPage } = await import("../features/infrastructure/network/neighbors_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    return c.html(<NeighborNetworksPage status={status} csrfToken={csrfToken} nonce={nonce} />);
  });

  router.get("/network", (c) => c.redirect("/network/active"));

  // ── AGENT FLEET (Modular Control) ──────────────────────────────────

  router.get("/deception", (c) => c.redirect("/agents/deception"));
  router.get("/agents", (c) => c.redirect("/dashboard"));

  // Unified Agent Routing Architecture
  router.route("/agents/deception", createHoneypotsRouter(services.honeypot));
  router.route("/agents", createAgentsRouter(getStatus));

  // ── SYSTEM (Administration & Metadata) ─────────────────────────────

  router.get("/system/info", async (c: Context) => {
    const { SystemInfoPage } = await import("../features/system/info_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    const hostname = Deno.hostname();
    return c.html(<SystemInfoPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} />);
  });

  router.get("/system/supply-chain", async (c: Context) => {
    const { SupplyChainPage } = await import("../features/system/supply_chain_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    const hostname = Deno.hostname();
    return c.html(<SupplyChainPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} />);
  });

  router.get("/system/ledger", async (c: Context) => {
    const { AuditPage } = await import("../features/forensic/audit/page.tsx") as any;
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    const hostname = Deno.hostname();
    return c.html(<AuditPage csrfToken={csrfToken} nonce={nonce} hostname={hostname} />);
  });

  router.get("/system/settings", async (c: Context) => {
    const { NotificationsPage } = await import("../features/governance/settings/notifications.tsx") as any;
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    const nonce = c.get("nonce");
    const hostname = Deno.hostname();
    return c.html(<NotificationsPage status={status} csrfToken={csrfToken} nonce={nonce} hostname={hostname} />);
  });

  return router;
}
