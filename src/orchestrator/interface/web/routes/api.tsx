import { Hono, Context } from "hono";
import { ServiceContainer } from "@core/container.ts";
import { SecurityMiddleware } from "../middleware/security.ts";
import { createReportsApi } from "../api/reports.ts";
import { createNotificationsApi } from "../api/notifications.ts";
import { createAuditApi } from "../api/audit.ts";
import { createStatsApi } from "../api/stats.ts";
import { createChaosApi } from "../api/chaos.ts";
import { createSupplyChainApi } from "../api/supply_chain.ts";
import { createAgentsApi } from "../api/agents.ts";
import { createThreatsApi } from "../api/threats.ts";
import { createComplianceApi } from "../api/compliance.ts";
import { createNetworkApi } from "../api/network.ts";
import { createMeshApi } from "../api/mesh.ts";
import { createAdminApi } from "../api/admin.ts";
import { getMetricsSnapshot } from "@domain/analysis/metrics_service.ts";
import { bootstrap as getBootstrapInfo } from "../../../app/bootstrapper.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { SignatureService } from "@infrastructure/system/protection/signature_service.ts";
import { isValidIP, isCriticalInfrastructure } from "@infrastructure/system/validation.ts";

/**
 * API Router
 * Handles all JSON/REST endpoints.
 */
export function createApiRouter(services: ServiceContainer, security: SecurityMiddleware) {
  const router = new Hono();

  // 1. Environmental Infrastructure (Discovery & Logs)
  router.route("/network", createNetworkApi(services, security));

  // 2. Mesh Operations (Restricted Auth)
  router.route("/mesh", createMeshApi(services, security));

  // 3. Admin Operations (Strict Role Check)
  router.route("/admin", createAdminApi(services, security));

  // 4. General Protected APIs
  router.use("*", security.requireRole("admin", "operator", "viewer"));
  
  router.route("/agents", createAgentsApi(services, security));
  router.route("/reports", createReportsApi(services.baseline, services.protection, security, services.forensicService));
  router.route("/notifications", createNotificationsApi(services.notifications, security));
  router.route("/audit", createAuditApi(services.audit, security));
  router.route("/stats", createStatsApi(services.eventBus, security));
  router.route("/chaos", createChaosApi(services.chaos, security.requireRole.bind(security)));
  router.route("/supply-chain", createSupplyChainApi(services.supplyChain, security));
  router.route("/threats", createThreatsApi(services, security));
  router.route("/compliance", createComplianceApi(services, security));

  // Autopilot Tactical Intelligence
  router.get("/autopilot/intelligence", (c: Context) => {
    return c.json(services.autopilot.getTacticalIntelligence());
  });

  router.get("/platform", (c: Context) => {
    const info = services.platformInfo;
    return c.json({ name: info.name, version: info.version, tag: info.tag });
  });

  router.post("/node/shadow", security.requireRole("admin"), (c: Context) => {
    return c.json({ success: true, message: "Shadow Mode Engaged" });
  });

  router.get("/metrics", (c: Context) => {
    const snapshot = getMetricsSnapshot();
    return c.json(snapshot || {});
  });

  router.get("/system/logs", async (c: Context) => {
    const logs = await services.audit.getRecentEvents(100);
    return c.json(logs);
  });

  router.get("/status", async (c: Context) => {
    const baseStatus = await getBootstrapInfo();
    return c.json(baseStatus);
  });

  router.get("/agent/status", async (c: Context) => {
    const metrics = getMetricsSnapshot();

    return c.json({
      firewall: { 
        active: true,
        pid: services.command.getPID("enforcer"),
        capabilities: ["PACKET_FILTER", "RATE_LIMITING", "IP_ISOLATION"],
        root: true,
        metrics: metrics?.firewall
      },
      vpn: {
        active: await services.protection.vpn.isConnected(),
        capabilities: ["MTLS_TUNNEL", "ENCRYPTED_MESH"],
        root: true,
        interface: "wg0",
        metrics: metrics?.vpn
      },
      ebpf: {
        active: services.command.isRunning("sentinel"),
        capabilities: ["LSM", "SYSCALL_HOOK", "PID_HIDING"],
        root: true,
        metrics: metrics?.forensics
      },
      fim: {
        active: services.command.isRunning("watchfile"),
        capabilities: ["INOTIFY", "AUDIT_LOGGING"],
        root: true,
        metrics: metrics?.forensics
      },
      honeypot: {
        active: services.command.isRunning("decoy"),
        capabilities: ["DECEPTION", "LOGGING"],
        root: false,
        metrics: metrics?.honeypot
      }
    });
  });

  router.get("/processes/tree", async (c: Context) => {
    if (services.processTracker.getTree().length < 5) {
      await services.processTracker.fullScan();
    }
    return c.json(services.processTracker.getTree());
  });

  // 5. Forensics & Active Defense
  router.get("/forensics/export", async (c: Context) => {
    const type = c.req.query("type");
    if (type === "network_intel") {
      try {
        const reportPath = Deno.env.get("INTEL_REPORT_PATH") || "./volume/reports/network_intel_report.md";
        const content = await Deno.readTextFile(reportPath);
        return c.text(content);
      } catch {
        return c.text("# Network Intelligence Report\nNo data available yet.", 404);
      }
    }
    const limit = c.req.query("limit") ? parseInt(c.req.query("limit")!) : 1000;
    const bundle = await services.forensicService.generateEvidenceBundle(limit);
    return c.json(bundle);
  });

  router.post("/defense/isolate", security.requireRole("admin", "operator"), async (c: Context) => {
    const { source, reason, ttl } = await c.req.json();
    if (!source) return c.json({ error: "Source required" }, 400);
    
    // If it's an IP, use the Intelligence Lifecycle Manager
    if (isValidIP(source)) {
      if (isCriticalInfrastructure(source)) return c.json({ error: "Cannot isolate critical infrastructure" }, 403);
      await services.curatedIntel.commitIsolation(source, reason || "MANUAL_OPERATOR_INTERVENTION", ttl || 24);
      return c.json({ success: true, message: `Indicator ${source} committed to active defense lifecycle.` });
    }

    const result = await services.forensicService.isolateSource(source, reason || "MANUAL_OPERATOR_INTERVENTION");
    return c.json(result);
  });

  router.post("/defense/purge", security.requireRole("admin"), async (c: Context) => {
    const { pid } = await c.req.json();
    if (!pid) return c.json({ error: "PID required" }, 400);
    const pidNum = parseInt(pid.toString());
    if (isNaN(pidNum)) return c.json({ error: "Invalid PID" }, 400);
    if (pidNum <= 1) return c.json({ error: "Cannot purge system critical processes (PID <= 1)" }, 403);
    
    const result = await services.protection.firewall.killProcess(pidNum);
    return c.json(result);
  });
  
  // 6. Governance & Policy (Restricted to Admin)
  router.use("/governance/*", security.requireRole("admin"));
  router.get("/governance/policy", (c: Context) => {
    return c.json(services.policy.getPolicy());
  });

  router.post("/governance/policy", async (c: Context) => {
    const payload = await c.req.json();
    const { policy: newPolicy, signature } = payload;
    
    if (!newPolicy || typeof newPolicy !== "object") return c.json({ error: "Invalid Policy manifest" }, 400);
    
    // 1. Schema Validation
    const required = ["version", "mode", "rules"];
    const missing = required.filter(k => !(k in newPolicy));
    if (missing.length > 0) return c.json({ error: `Policy missing fields: ${missing.join(", ")}` }, 400);

    // 2. Cryptographic Integrity Check (If policy has a public key defined)
    const currentPolicy = services.policy.getPolicy();
    if (currentPolicy.publicKey && currentPolicy.strictMode) {
        if (!signature) return c.json({ error: "Strict Mode Active: Policy signature required." }, 401);
        
        const sigService = new SignatureService();
        const isValid = await sigService.verify(newPolicy, signature, currentPolicy.publicKey);
        if (!isValid) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.ERROR,
                caller: "orchestrator:interface:web:api:governance",
                message: `SECURITY ALERT: Rejected unsigned/invalid policy manifest v${newPolicy.version}`
            });
            return c.json({ error: "Invalid cryptographic signature." }, 401);
        }
    }

    if (!["STRICT", "ADAPTIVE", "MONITOR"].includes(newPolicy.mode)) {
        return c.json({ error: "Invalid policy mode" }, 400);
    }
    
    services.policy.updatePolicy(newPolicy);
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:interface:web:api:governance",
        message: `Security Policy updated: v${newPolicy.version} (${newPolicy.mode})`
    });
    return c.json({ success: true, message: "Security Policy synchronized and active." });
  });

  return router;
}
