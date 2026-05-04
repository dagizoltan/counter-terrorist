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

  // ── DASHBOARD (Strategic Core) ───────────────────────────────────

  router.get("/infrastructure/mesh", async (c: Context) => {
    const { MeshTopologyPage } = await import("../features/infrastructure/mesh/page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<MeshTopologyPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/news", async (c: Context) => {
    const { NewsPage: OperationalNewsPage } = await import("../features/situational/intel/OperationalNewsPage.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<OperationalNewsPage status={status} csrfToken={csrfToken} />);
  });

  // ── AGENT FLEET (Modular Control) ──────────────────────────────────

  router.get("/network", (c) => c.redirect("/agents/network"));
  router.get("/deception", (c) => c.redirect("/agents/deception"));
  router.get("/agents", (c) => c.redirect("/agents/firewall"));

  router.get("/agents/firewall", async (c: Context) => {
    const { FirewallPage } = await import("../features/infrastructure/agents/firewall_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<FirewallPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/agents/network", async (c: Context) => {
    const { NetworkPage } = await import("../features/infrastructure/agents/network_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<NetworkPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/agents/pcap", async (c: Context) => {
    const { PcapPage } = await import("../features/infrastructure/agents/pcap_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<PcapPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/agents/scanner", async (c: Context) => {
    const { ScannerPage } = await import("../features/infrastructure/agents/scanner_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<ScannerPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/agents/fim", async (c: Context) => {
    const { FimPage } = await import("../features/infrastructure/agents/fim_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<FimPage status={status} csrfToken={csrfToken} />);
  });

  router.get("/agents/ebpf", async (c: Context) => {
    const { EbpfPage } = await import("../features/infrastructure/agents/ebpf_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<EbpfPage status={status} csrfToken={csrfToken} />);
  });

  router.route("/agents/deception", createHoneypotsRouter(services.honeypot));

  // ── SYSTEM (Administration & Metadata) ─────────────────────────────

  router.get("/system/info", async (c: Context) => {
    const { SystemInfoPage } = await import("../features/system/info_page.tsx");
    const status = await getStatus();
    const csrfToken = c.get("csrfToken");
    return c.html(<SystemInfoPage status={status} csrfToken={csrfToken} />);
  });


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
