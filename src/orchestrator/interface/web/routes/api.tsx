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

/**
 * API Router
 * Handles all JSON/REST endpoints.
 */
export function createApiRouter(services: ServiceContainer, security: SecurityMiddleware) {
  const router = new Hono();

  // 1. Mesh Operations (Restricted Auth)
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
    const peerIp = c.req.header("x-forwarded-for") || "unknown";
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
    console.log(`[MESH:API] Received sync from ${peerIp}: ${payload.type}`);
    
    if (payload.type === "GOSSIP_BLOCK" && payload.ip) {
        await services.protection.firewall.blockIp(payload.ip);
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

  router.get("/platform", (c: Context) => {
    const info = services.platformInfo;
    return c.json({ name: info.name, version: info.version, tag: info.tag });
  });

  router.get("/metrics", async (c: Context) => {
    const { getMetricsSnapshot } = await import("../../../domain/analysis/metrics_service.ts");
    const snapshot = getMetricsSnapshot();
    return c.json(snapshot || {});
  });

  router.get("/status", async (c: Context) => {
    const { bootstrap } = await import("../../../bootstrapper.ts");
    const baseStatus = await bootstrap();
    return c.json(baseStatus);
  });

  router.get("/agent/status", async (c: Context) => {
    const { getMetricsSnapshot } = await import("../../../domain/analysis/metrics_service.ts");
    const metrics = getMetricsSnapshot();

    return c.json({
      firewall: { 
        active: true,
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

  return router;
}
