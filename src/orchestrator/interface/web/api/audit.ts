import { Hono } from "hono";
import { AuditService } from "@domain/index.ts";

export function createAuditApi(auditService: AuditService) {
  const auditApi = new Hono();

  auditApi.get("/", async (c) => {
      const limit = Number(c.req.query("limit")) || 50;
      const cursor = c.req.query("cursor");
      if (cursor) {
          const result = await auditService.getEvents(limit, cursor);
          return c.json(result);
      }
      const events = await auditService.getRecentEvents(limit);
      return c.json(events);
  });

  /**
   * Verifies the integrity of the audit log hash chain.
   * Returns whether any events have been tampered with or deleted.
   */
  auditApi.get("/verify", async (c) => {
      const limit = Number(c.req.query("limit")) || 1000;
      try {
        const result = await auditService.verifyChain(limit);
        const status = result.valid ? 200 : 409; 
        return c.json(result, status);
      } catch (e) {
        return c.json({ error: "Failed to verify chain", details: (e as Error).message }, 500);
      }
  });

  auditApi.get("/status", async (c) => {
    const status = await auditService.getChainStatus();
    return c.json(status);
  });

  return auditApi;
}
