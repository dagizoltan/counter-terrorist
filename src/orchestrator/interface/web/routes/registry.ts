import { Hono, Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SecurityMiddleware } from "../middleware/security.ts";

// --- UI Handlers ---
import * as situationalHandlers from "../features/situational/handlers.ts";
import * as forensicHandlers from "../features/forensic/handlers.ts";
import * as systemHandlers from "../features/system/handlers.ts";
import * as networkHandlers from "../features/infrastructure/network/handlers.ts";
import * as agentHandlers from "../features/infrastructure/agents/handlers.ts";
import * as deceptionHandlers from "../features/defense/deception/handlers.ts";
import * as authHandlers from "../features/auth/login/handlers.ts";

// --- API Handlers ---
import * as networkApiHandlers from "../api/network.ts";
import * as meshApiHandlers from "../api/mesh.ts";
import * as adminApiHandlers from "../api/admin.ts";
import * as agentApiHandlers from "../api/agents.ts";
import * as reportsApiHandlers from "../api/reports.ts";
import * as notificationApiHandlers from "../api/notifications.ts";
import * as auditApiHandlers from "../api/audit.ts";
import * as statsApiHandlers from "../api/stats.ts";
import * as chaosApiHandlers from "../api/chaos.ts";
import * as supplyChainApiHandlers from "../api/supply_chain.ts";
import * as threatApiHandlers from "../api/threats.ts";
import * as complianceApiHandlers from "../api/compliance.ts";

import { jsx } from "hono/jsx";

export function registerRoutes(app: Hono, services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<any>) {

  // --- AUTH ROUTES ---
  const authDeps = {
    checkLoginRateLimit: async (ip: string) => {
      const result = await services.rateLimit.checkLimit(`login:${ip}`, 10, 60000);
      return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
    },
    isTokenValid: async (token: string) => {
      const { secureCompare } = await import("@infrastructure/system/validation.ts");
      if (await secureCompare(token, services.config.getToken())) return "admin";
      const result = await services.apiKeys.validateApiKey(token);
      return (result.success && result.data) ? result.data : null;
    },
    sessionService: services.sessions,
    config: services.config
  };

  app.get("/login", authHandlers.loginHandler);
  app.post("/login", authHandlers.postLoginHandler(authDeps));
  app.post("/logout", authHandlers.logoutHandler(authDeps));
  app.get("/login/", (c) => c.redirect("/login"));
  app.get("/logout/", (c) => c.redirect("/logout"));

  // --- UI ROUTES (PROTECTED) ---
  const ui = app.basePath("/");
  ui.use("*", security.requireRole("admin", "operator", "viewer"));

  ui.get("/", (c) => c.redirect("/dashboard"));
  ui.get("/dashboard", situationalHandlers.dashboardHandler);
  ui.get("/infrastructure", situationalHandlers.sysInfoHandler);
  ui.get("/intel/map", situationalHandlers.threatMapHandler);
  ui.get("/intel/feed", situationalHandlers.operationalNewsHandler);

  ui.get("/forensics", forensicHandlers.forensicCenterHandler);
  ui.get("/forensics/compliance", forensicHandlers.complianceCenterHandler);

  ui.get("/infrastructure/mesh", async (c: Context) => {
    const { MeshTopologyPage } = await import("../features/infrastructure/mesh/page.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(jsx(MeshTopologyPage, { status, csrfToken, nonce, userRole }));
  });

  ui.get("/intel/public-ip-collections", async (c: Context) => {
    const { default: IpIntelPage } = await import("../features/defense/ip_intel_page.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(jsx(IpIntelPage, { status, csrfToken, nonce, userRole }));
  });

  ui.get("/intel/artifact-collections", async (c: Context) => {
    const { default: ArtifactIntelPage } = await import("../features/defense/artifact_intel_page.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(jsx(ArtifactIntelPage, { status, csrfToken, nonce, userRole }));
  });

  ui.get("/network", (c) => c.redirect("/network/active"));
  ui.get("/network/active", networkHandlers.activeNetworkHandler);
  ui.get("/network/neighbors", networkHandlers.neighborNetworksHandler);

  ui.get("/deception", (c) => c.redirect("/agents/deception"));
  ui.get("/agents/deception", deceptionHandlers.honeypotsHandler(services.honeypot));
  ui.get("/agents", agentHandlers.agentsHandler(getStatus));
  ui.get("/agents/:name", agentHandlers.agentDetailHandler(getStatus));

  ui.get("/system/info", systemHandlers.systemInfoHandler);
  ui.get("/system/supply-chain", systemHandlers.supplyChainHandler);
  ui.get("/system/ledger", forensicHandlers.auditPageHandler);
  ui.get("/system/settings", systemHandlers.settingsHandler);

  // --- API ROUTES (PROTECTED) ---
  const api = app.basePath("/api");

  // Network API
  api.get("/network/discovery", security.requireRole("admin", "operator", "viewer"), networkApiHandlers.networkDiscoveryHandler(services));
  api.get("/network/logs", security.requireRole("admin", "operator", "viewer"), networkApiHandlers.networkLogsHandler(services));
  api.post("/network/rotate", security.requireRole("admin", "operator"), networkApiHandlers.rotateIdentityHandler(services));
  api.post("/network/mode", security.requireRole("admin", "operator"), networkApiHandlers.setStealthModeHandler(services));

  // Mesh API (Custom Auth)
  api.use("/mesh/*", security.meshAuth(services.config.getMeshSecret()));
  api.get("/mesh/nodes", meshApiHandlers.meshNodesHandler(services));
  api.get("/mesh/ping", meshApiHandlers.meshPingHandler(services));
  api.post("/mesh/sync", meshApiHandlers.meshSyncHandler(services));
  api.post("/mesh/resync", security.requireRole("admin", "operator"), meshApiHandlers.meshResyncHandler(services));

  // Admin API
  api.use("/admin/*", security.requireRole("admin"));
  api.get("/admin/api-keys", adminApiHandlers.listApiKeysHandler(services));
  api.post("/admin/api-keys", adminApiHandlers.createApiKeyHandler(services));
  api.delete("/admin/api-keys/:id", adminApiHandlers.revokeApiKeyHandler(services));

  // Other APIs (Standard Role Check)
  api.use("*", security.requireRole("admin", "operator", "viewer"));

  api.post("/agents/:name/restart", security.requireRole("admin", "operator"), agentApiHandlers.restartSidecarHandler(services));
  api.post("/agents/:name/stop", security.requireRole("admin", "operator"), agentApiHandlers.stopSidecarHandler(services));
  api.post("/agents/:name/command", security.requireRole("admin", "operator"), agentApiHandlers.sendAgentCommandHandler(services));
  api.post("/agents/vpn/connect", security.requireRole("admin", "operator"), agentApiHandlers.vpnConnectHandler(services));
  api.post("/agents/vpn/disconnect", security.requireRole("admin", "operator"), agentApiHandlers.vpnDisconnectHandler(services));
  api.post("/agents/firewall/block", security.requireRole("admin", "operator"), agentApiHandlers.firewallBlockHandler(services));
  api.post("/agents/firewall/unblock", security.requireRole("admin", "operator"), agentApiHandlers.firewallUnblockHandler(services));
  api.post("/agents/firewall/flush", security.requireRole("admin"), agentApiHandlers.firewallFlushHandler(services));
  api.get("/agents/firewall/status", agentApiHandlers.firewallStatusHandler(services));
  api.post("/agents/scanner/scan", security.requireRole("admin", "operator"), agentApiHandlers.scannerScanHandler(services));
  api.post("/agents/scanner/sync-signatures", security.requireRole("admin", "operator"), agentApiHandlers.scannerSyncHandler(services));
  api.get("/agents/scanner/ledger", agentApiHandlers.scannerLedgerHandler(services));

  api.get("/reports/export", reportsApiHandlers.exportReportHandler(services.baseline, services.protection));
  api.get("/reports/forensics/list", reportsApiHandlers.listForensicArtifactsHandler());
  api.post("/reports/forensics/bundle", security.requireRole("admin", "operator"), reportsApiHandlers.bundleForensicsHandler(services.forensicService));
  api.get("/reports/forensics/download/:name", reportsApiHandlers.downloadForensicArtifactHandler());

  api.get("/notifications", notificationApiHandlers.getWebhooksHandler(services.notifications));
  api.post("/notifications", security.requireRole("admin", "operator"), notificationApiHandlers.addWebhookHandler(services.notifications));
  api.delete("/notifications/:id", security.requireRole("admin", "operator"), notificationApiHandlers.deleteWebhookHandler(services.notifications));

  api.get("/audit", auditApiHandlers.getAuditEventsHandler(services.audit));
  api.get("/audit/verify", security.requireRole("admin", "operator"), auditApiHandlers.verifyAuditChainHandler(services.audit));
  api.get("/audit/status", auditApiHandlers.getAuditStatusHandler(services.audit));

  api.get("/stats/honeypot", statsApiHandlers.honeypotStatsHandler(services.eventBus));

  api.post("/chaos/simulate", security.requireRole("admin"), chaosApiHandlers.simulateChaosHandler(services.chaos));

  api.get("/supply-chain/sbom", supplyChainApiHandlers.getSBOMHandler(services.supplyChain));
  api.get("/supply-chain/status", supplyChainApiHandlers.getSupplyChainStatusHandler(services.supplyChain));

  api.get("/threats/feed", threatApiHandlers.getThreatSignalsHandler(services));
  api.get("/threats/identified", threatApiHandlers.getIdentifiedThreatsHandler(services));
  api.get("/threats/identified/stats", threatApiHandlers.getThreatStatsHandler(services));
  api.post("/threats/identified/sync", security.requireRole("admin", "operator"), threatApiHandlers.syncThreatsHandler(services));
  api.post("/threats/identified/wipe", security.requireRole("admin"), threatApiHandlers.wipeThreatsHandler(services));

  api.get("/compliance/report", complianceApiHandlers.getComplianceReportHandler(services));
  api.get("/compliance/snapshot", complianceApiHandlers.getComplianceSnapshotHandler(services));
  api.get("/compliance/export", complianceApiHandlers.exportSignedBundleHandler(services));
  api.get("/compliance/logs", complianceApiHandlers.getDiagnosticLogsHandler(services));
  api.get("/compliance/network", complianceApiHandlers.getComplianceNetworkLogsHandler(services));
  api.get("/compliance/audit", complianceApiHandlers.verifyComplianceAuditHandler(services));
  api.get("/compliance/incidents", complianceApiHandlers.getIncidentsHandler(services));
  api.post("/compliance/incidents/:id/status", security.requireRole("admin", "operator"), complianceApiHandlers.updateIncidentStatusHandler(services));

  api.get("/autopilot/intelligence", (c: Context) => c.json(services.autopilot.getTacticalIntelligence()));
  api.get("/platform", (c: Context) => c.json({ name: services.platformInfo.name, version: services.platformInfo.version, tag: services.platformInfo.tag }));
  api.post("/node/shadow", security.requireRole("admin"), (c: Context) => c.json({ success: true, message: "Shadow Mode Engaged" }));
  api.get("/metrics", async (c: Context) => {
    const { getMetricsSnapshot } = await import("@domain/analysis/metrics_service.ts");
    return c.json(getMetricsSnapshot() || {});
  });
  api.get("/system/logs", async (c: Context) => c.json(await services.audit.getRecentEvents(100)));
  api.get("/status", async (c: Context) => {
    const { bootstrap } = await import("../../../app/bootstrapper.ts");
    return c.json(await bootstrap());
  });
  api.get("/agent/status", async (c: Context) => {
    const { getMetricsSnapshot } = await import("@domain/analysis/metrics_service.ts");
    const metrics = getMetricsSnapshot();
    return c.json({
      firewall: { active: true, pid: services.command.getPID("enforcer"), capabilities: ["PACKET_FILTER", "RATE_LIMITING", "IP_ISOLATION"], root: true, metrics: metrics?.firewall },
      vpn: { active: await services.protection.vpn.isConnected(), capabilities: ["MTLS_TUNNEL", "ENCRYPTED_MESH"], root: true, interface: "wg0", metrics: metrics?.vpn },
      ebpf: { active: services.command.isRunning("sentinel"), capabilities: ["LSM", "SYSCALL_HOOK", "PID_HIDING"], root: true, metrics: metrics?.forensics },
      fim: { active: services.command.isRunning("watchfile"), capabilities: ["INOTIFY", "AUDIT_LOGGING"], root: true, metrics: metrics?.forensics },
      honeypot: { active: services.command.isRunning("decoy"), capabilities: ["DECEPTION", "LOGGING"], root: false, metrics: metrics?.honeypot }
    });
  });
  api.get("/processes/tree", async (c: Context) => {
    if (services.processTracker.getTree().length < 5) await services.processTracker.fullScan();
    return c.json(services.processTracker.getTree());
  });

  api.get("/forensics/export", async (c: Context) => {
    const type = c.req.query("type");
    if (type === "network_intel") {
      try {
        const reportPath = Deno.env.get("INTEL_REPORT_PATH") || "./volume/reports/network_intel_report.md";
        return c.text(await Deno.readTextFile(reportPath));
      } catch {
        return c.text("# Network Intelligence Report\nNo data available yet.", 404);
      }
    }
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 1000;
    return c.json(await services.forensicService.generateEvidenceBundle(limit));
  });

  api.post("/defense/isolate", security.requireRole("admin", "operator"), async (c: Context) => {
    const { source, reason, ttl } = await c.req.json();
    if (!source) return c.json({ error: "Source required" }, 400);
    const { isValidIP, isCriticalInfrastructure } = await import("@infrastructure/system/validation.ts");
    if (isValidIP(source)) {
      if (isCriticalInfrastructure(source)) return c.json({ error: "Cannot isolate critical infrastructure" }, 403);
      await services.curatedIntel.commitIsolation(source, reason || "MANUAL_OPERATOR_INTERVENTION", ttl || 24);
      return c.json({ success: true, message: `Indicator ${source} committed to active defense lifecycle.` });
    }
    return c.json(await services.forensicService.isolateSource(source, reason || "MANUAL_OPERATOR_INTERVENTION"));
  });

  api.post("/defense/purge", security.requireRole("admin"), async (c: Context) => {
    const { pid } = await c.req.json();
    if (!pid) return c.json({ error: "PID required" }, 400);
    const pidNum = parseInt(pid.toString());
    if (isNaN(pidNum)) return c.json({ error: "Invalid PID" }, 400);
    if (pidNum <= 1) return c.json({ error: "Cannot purge system critical processes (PID <= 1)" }, 403);
    return c.json(await services.protection.firewall.killProcess(pidNum));
  });

  api.use("/governance/*", security.requireRole("admin"));
  api.get("/governance/policy", (c: Context) => c.json(services.policy.getPolicy()));
  api.post("/governance/policy", async (c: Context) => {
    const payload = await c.req.json();
    const { policy: newPolicy, signature } = payload;
    if (!newPolicy || typeof newPolicy !== "object") return c.json({ error: "Invalid Policy manifest" }, 400);
    const required = ["version", "mode", "rules"];
    const missing = required.filter(k => !(k in newPolicy));
    if (missing.length > 0) return c.json({ error: `Policy missing fields: ${missing.join(", ")}` }, 400);
    const currentPolicy = services.policy.getPolicy();
    if (currentPolicy.publicKey && currentPolicy.strictMode) {
        if (!signature) return c.json({ error: "Strict Mode Active: Policy signature required." }, 401);
        const { SignatureService } = await import("@infrastructure/system/protection/signature_service.ts");
        const sigService = new SignatureService();
        const isValid = await sigService.verify(newPolicy, signature, currentPolicy.publicKey);
        if (!isValid) return c.json({ error: "Invalid cryptographic signature." }, 401);
    }
    if (!["STRICT", "ADAPTIVE", "MONITOR"].includes(newPolicy.mode)) return c.json({ error: "Invalid policy mode" }, 400);
    services.policy.updatePolicy(newPolicy);
    return c.json({ success: true, message: "Security Policy synchronized and active." });
  });

}
