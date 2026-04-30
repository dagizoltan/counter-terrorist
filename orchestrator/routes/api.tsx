import { Hono, Context } from "hono";
import { ServiceContainer } from "../core/container.ts";
import { SecurityMiddleware } from "../infrastructure/middleware/security.ts";
import { createReportsApi } from "../api/reports.ts";
import { createNotificationsApi } from "../api/notifications.ts";
import { createAuditApi } from "../api/audit.ts";
import { createStatsApi } from "../api/stats.ts";
import { createChaosApi } from "../api/chaos.ts";
import { createSupplyChainApi } from "../api/supply_chain.ts";

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

  // 2. Admin Operations (Strict Role Check)
  router.use("/admin/*", security.requireRole("admin"));
  router.get("/admin/api-keys", async (c: Context) => {
    return c.json(await services.apiKeys.listApiKeys());
  });
  
  router.post("/admin/api-keys", async (c: Context) => {
    const { name, role } = await c.req.json();
    if (!name || !["operator", "viewer"].includes(role)) return c.json({ error: "Invalid name or role" }, 400);
    const result = await services.apiKeys.createApiKey(name, role);
    if (!result.success) return c.json({ error: result.error.message }, 500);
    return c.json(result.data);
  });

  router.delete("/admin/api-keys/:id", async (c: Context) => {
    const id = c.req.param("id");
    const result = await services.apiKeys.revokeApiKey(id);
    if (!result.success) return c.json({ error: result.error.message }, 500);
    return c.json({ success: true });
  });

  // 3. General Protected APIs
  router.use("*", security.requireRole("admin", "operator", "viewer"));
  
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
    const { getMetricsSnapshot } = await import("../services/metrics_service.ts");
    const snapshot = getMetricsSnapshot();
    return c.json(snapshot || {});
  });

  router.get("/processes/tree", async (c: Context) => {
    if (services.processTracker.getTree().length < 5) {
      await services.processTracker.fullScan();
    }
    return c.json(services.processTracker.getTree());
  });

  return router;
}
