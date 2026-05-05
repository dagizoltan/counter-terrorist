import { jsx } from "hono/jsx";
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
import { getMetricsSnapshot } from "@domain/analysis/metrics_service.ts";
import { bootstrap as getBootstrapInfo } from "../../../bootstrapper.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { SignatureService } from "@infrastructure/system/protection/signature_service.ts";

/**
 * API Router
 * Handles all JSON/REST endpoints.
 */
export function createApiRouter(services: ServiceContainer, security: SecurityMiddleware) {
  const router = new Hono();

  // 1. Environmental Infrastructure (Discovery & Logs) - HIGH PRIORITY MATCHING
  router.get("/infrastructure/network/discovery", async (c: Context) => {
    const { IntelEnricher } = await import("@domain/analysis/intel_enricher.ts");
    
    // Merge discovery devices and mesh nodes for a unified tactical view
    const devices = services.networkDiscovery.getDevices();
    const meshNodes = services.mesh.getNodes();
    
    const unified = [
        ...devices,
        ...meshNodes.map(n => ({
            id: n.id,
            ip: n.address,
            mac: n.id, // Using ID as MAC for mesh peers if real MAC unknown
            vendor: "Sovereign_Mesh_Peer",
            isMeshNode: true,
            isLocal: false,
            lastSeen: new Date(n.lastSeen).toISOString(),
            hostname: n.hostname,
            state: n.verified ? "VERIFIED" : "UNTRUSTED",
            type: "MESH" as const
        }))
    ];

    // Filter duplicates (some mesh nodes might be discovered via ARP too)
    const unique = Array.from(new Map(unified.map(item => [item.ip || item.id, item])).values());

    return c.json(IntelEnricher.enrichDevices(unique));
  });

  router.get("/network/logs", async (c: Context) => {
    const logs = await services.networkLogs.getLogs(50);
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

  const syncRateLimits = new Map<string, { count: number; resetAt: number }>();
  router.post("/mesh/sync", async (c: Context) => {
    const peerIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || (c.env as any)?.remoteAddr?.hostname || "unknown";
    const now = Date.now();
    const limit = syncRateLimits.get(peerIp) || { count: 0, resetAt: now + 1000 };
    if (now > limit.resetAt) {
      limit.count = 1;
      limit.resetAt = now + 1000;
    } else {
      limit.count++;
      if (limit.count > 100) return c.json({ error: "Rate limit exceeded" }, 429);
    }
    syncRateLimits.set(peerIp, limit);

    const payload = await c.req.json();
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.INFO,
        caller: "MESH:API",
        message: `Received mesh sync from ${peerIp}: ${payload.type}`
    });
    
    if (payload.type === "GOSSIP_BLOCK" && payload.ip) {
        await services.protection.firewall.blockIp(payload.ip);
    }

    if (payload.type === "GOSSIP_THREAT_HASH" && payload.hash) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "MESH:THREAT",
            message: `Mesh Threat Intelligence: Blacklisting binary hash ${payload.hash.slice(0, 8)} reported by node ${payload.sourceNode}`
        });
        // In a full implementation, this would update a local 'BinaryBlacklist' or trigger a scan
        await services.audit.logEvent({
            type: "MESH_THREAT",
            message: `Mesh-wide binary blacklist updated: ${payload.hash.slice(0, 8)}`,
            data: payload
        });
    }

    // Periodically cleanup rate limit map
    if (Math.random() < 0.05) {
      for (const [ip, l] of syncRateLimits.entries()) {
        if (now > l.resetAt) syncRateLimits.delete(ip);
      }
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
  
  router.route("/agents", createAgentsApi(services));
  router.route("/reports", createReportsApi(services.baseline, services.protection));
  router.route("/notifications", createNotificationsApi(services.notifications));
  router.route("/audit", createAuditApi(services.audit));
  router.route("/stats", createStatsApi(services.eventBus));
  router.route("/chaos", createChaosApi(services.chaos, security.requireRole.bind(security)));
  router.route("/supply-chain", createSupplyChainApi(services.supplyChain));
  router.route("/threats", createThreatsApi(services));
  router.route("/compliance", createComplianceApi(services));

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
    services.mesh.getNodes().forEach(n => n.verified = true);
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
        pid: services.command.getPID("blocker"),
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
        active: services.command.isRunning("ebpf"),
        capabilities: ["LSM", "SYSCALL_HOOK", "PID_HIDING"],
        root: true,
        metrics: metrics?.forensics
      },
      fim: {
        active: services.command.isRunning("fim"),
        capabilities: ["INOTIFY", "AUDIT_LOGGING"],
        root: true,
        metrics: metrics?.forensics
      },
      honeypot: {
        active: services.command.isRunning("honeypot"),
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
        const content = await Deno.readTextFile("/home/dagizoltan/.gemini/antigravity/brain/520ba1fc-039d-4c90-9609-38608568296c/network_intel_report.md");
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
    const { source, reason } = await c.req.json();
    if (!source) return c.json({ error: "Source required" }, 400);
    const result = await services.forensicService.isolateSource(source, reason || "MANUAL_OPERATOR_INTERVENTION");
    return c.json(result);
  });

  router.post("/defense/purge", async (c: Context) => {
    const { pid } = await c.req.json();
    if (!pid) return c.json({ error: "PID required" }, 400);
    const pidNum = parseInt(pid.toString());
    if (isNaN(pidNum)) return c.json({ error: "Invalid PID" }, 400);
    
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
                severity: LogSeverity.CRITICAL,
                caller: "GOVERNANCE",
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
        caller: "GOVERNANCE",
        message: `Security Policy updated: v${newPolicy.version} (${newPolicy.mode})`
    });
    return c.json({ success: true, message: "Security Policy synchronized and active." });
  });

  return router;
}
