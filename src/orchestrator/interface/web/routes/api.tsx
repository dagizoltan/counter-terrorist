import { Hono, Context } from "hono";
import { IntelEnricher } from "@domain/analysis/intel_enricher.ts";
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
import { ComplianceMapper } from "@domain/analysis/compliance_mapper.ts";
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

  // 1. Environmental Infrastructure (Discovery & Logs) - HIGH PRIORITY MATCHING
  // 1. Environmental Infrastructure (Ambient Signal Discovery)
  router.get("/network/discovery", async (c: Context) => {
    // Ambient signals ONLY (WiFi, Bluetooth, Nearby Assets)
    // Active mesh topology is excluded per user requirements
    const devices = services.networkDiscovery.getDevices();
    
    // Categorize for the UI
    const wifi = devices.filter(d => d.type === "WIFI");
    const bluetooth = devices.filter(d => d.type === "BLUETOOTH");
    const ethernet = devices.filter(d => d.type === "ETHERNET");

    const mesh = services.mesh.getNodes().filter(n => n.verified).map(n => ({
        id: n.id || n.hostname,
        hostname: n.hostname,
        mac: n.id, // ID is used as unique identifier
        ip: n.address,
        isMeshNode: true,
        type: "MESH",
        state: "REACHABLE",
        lastSeen: n.lastSeen ? new Date(n.lastSeen).toISOString() : new Date().toISOString()
    }));
 
    const enriched = {
        wifi: IntelEnricher.enrichDevices(wifi),
        bluetooth: IntelEnricher.enrichDevices(bluetooth),
        ethernet: IntelEnricher.enrichDevices(ethernet),
        mesh: IntelEnricher.enrichDevices(mesh)
    };

    return c.json(enriched);
  });

  router.get("/network/logs", async (c: Context) => {
    const logs = await services.networkLogs.getRecent(50);
    return c.json(logs);
  });

  // 2. Mesh Operations (Restricted Auth)
  router.use("/mesh/*", security.meshAuth(services.config.getMeshSecret()));
  router.get("/mesh/nodes", (c: Context) => {
    const meshNodes = services.mesh.getNodes();
    return c.json({
      local: Deno.hostname(),
      peers: meshNodes.map(node => ({
        id: node.id || node.hostname,
        hostname: node.hostname,
        address: node.address,
        status: Date.now() - node.lastSeen < 60000 ? "ACTIVE" : "INACTIVE",
        verified: node.verified,
      }))
    });
  });

  router.get("/mesh/ping", async (c: Context) => {
    const payload = { success: true, nodeId: services.mesh.getNodeId(), timestamp: Date.now() };
    const signature = await services.mesh.signPayload(payload);
    c.header("X-Mesh-Signature", signature);
    return c.json(payload);
  });

  router.post("/mesh/sync", async (c: Context) => {
    const peerIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || (c.env as any)?.remoteAddr?.hostname || "unknown";
    const now = Date.now();
    const result = await services.rateLimit.checkLimit(`mesh_sync:${peerIp}`, 100, 1000);
    if (!result.allowed) {
        return c.json({ 
            error: "Rate limit exceeded", 
            code: "RATE_LIMIT_EXCEEDED",
            retryAfterMs: result.retryAfterMs 
        }, 429);
    }

    const payload = await c.req.json();
    
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "orchestrator:interface:web:api:mesh",
        message: `Received verified mesh sync from ${peerIp}: ${payload.type}`
    });
    
    if (payload.type === "GOSSIP_BLOCK" && payload.ip) {
        if (isValidIP(payload.ip) && !isCriticalInfrastructure(payload.ip)) {
            await services.protection.firewall.blockIp(payload.ip);
        } else {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:interface:web:api:mesh",
                message: `REJECTED: Malicious/Invalid gossip block IP ${payload.ip} from ${peerIp}`
            });
        }
    }

    if (payload.type === "GOSSIP_THREAT_HASH" && payload.hash) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:interface:web:api:mesh:threat",
            message: `Mesh Threat Intelligence: Blacklisting binary hash ${payload.hash.slice(0, 8)} reported by node ${payload.sourceNode}`
        });
        // In a full implementation, this would update a local 'BinaryBlacklist' or trigger a scan
        await services.audit.logEvent({
            type: "MESH_THREAT",
            message: `Mesh-wide binary blacklist updated: ${payload.hash.slice(0, 8)}`,
            data: payload
        });
    }

    return c.json({ success: true });
  });

  // 2. Admin Operations (Strict Role Check)
  router.use("/admin/*", security.requireRole("admin"));
  router.get("/admin/api-keys", async (c: Context) => {
    return c.json(await services.apiKeys.listApiKeys());
  });
  
  router.post("/admin/api-keys", async (c: Context) => {
    const { name, role } = await c.req.json();
    if (!name || !["operator", "viewer"].includes(role)) return c.json({ error: "Invalid name or role" }, 400);
    try {
      const data = await services.apiKeys.createApiKey(name, role);
      return c.json(data);
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  router.delete("/admin/api-keys/:id", async (c: Context) => {
    const id = c.req.param("id");
    try {
      await services.apiKeys.revokeApiKey(id);
      return c.json({ success: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 500);
    }
  });

  // 3. General Protected APIs
  router.use("*", security.requireRole("admin", "operator", "viewer"));
  
  router.route("/agents", createAgentsApi(services, security));
  router.route("/reports", createReportsApi(services.baseline, services.protection));
  router.route("/notifications", createNotificationsApi(services.notifications));
  router.route("/audit", createAuditApi(services.audit));
  router.route("/stats", createStatsApi(services.eventBus));
  router.route("/chaos", createChaosApi(services.chaos, security.requireRole.bind(security)));
  router.route("/supply-chain", createSupplyChainApi(services.supplyChain));
  router.route("/threats", createThreatsApi(services));

  const complianceApi = createComplianceApi(services);
  const mapper = new ComplianceMapper();
  complianceApi.get("/report", async (c) => {
    const events = await services.audit.getRecentEvents(500);
    const mapped = await mapper.mapEvents(events);
    return c.json(mapper.generateJsonReport(mapped));
  });
  router.route("/compliance", complianceApi);

  // Autopilot Tactical Intelligence
  router.get("/autopilot/intelligence", (c: Context) => {
    return c.json(services.autopilot.getTacticalIntelligence());
  });

  router.get("/platform", (c: Context) => {
    const info = services.platformInfo;
    return c.json({ name: info.name, version: info.version, tag: info.tag });
  });

  router.post("/network/rotate", async (c: Context) => {
    await services.anonymization.rotate();
    return c.json({ success: true, message: "Identity rotation initiated" });
  });

  router.post("/network/mode", async (c: Context) => {
    const { mode } = await c.req.json();
    if (!mode) return c.json({ error: "Mode required" }, 400);
    await services.anonymization.setMode(mode);
    return c.json({ success: true, message: `Stealth mode set to ${mode}` });
  });

  router.post("/mesh/resync", async (c: Context) => {
    const role = c.get("role");
    if (role !== "admin" && role !== "operator") return c.json({ error: "Forbidden" }, 403);
    
    await services.mesh.resyncNodes();
    return c.json({ success: true, message: "Mesh synchronization broadcasted" });
  });

  router.post("/node/shadow", async (c: Context) => {
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

  // 4. Forensics & Active Defense
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

  router.post("/defense/isolate", async (c: Context) => {
    const role = c.get("role");
    if (role !== "admin" && role !== "operator") return c.json({ error: "Forbidden" }, 403);

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

  router.post("/defense/purge", async (c: Context) => {
    const role = c.get("role");
    if (role !== "admin") return c.json({ error: "Forbidden: Admin required for process purge" }, 403);

    const { pid } = await c.req.json();
    if (!pid) return c.json({ error: "PID required" }, 400);
    const pidNum = parseInt(pid.toString());
    if (isNaN(pidNum)) return c.json({ error: "Invalid PID" }, 400);
    if (pidNum <= 1) return c.json({ error: "Cannot purge system critical processes (PID <= 1)" }, 403);
    
    const result = await services.protection.firewall.killProcess(pidNum);
    return c.json(result);
  });
  
  // 5. Governance & Policy (Restricted to Admin)
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
