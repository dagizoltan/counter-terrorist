import { Hono } from "hono";
import { AuditService } from "../services/index.ts";

export function createAuditApi(auditService: AuditService) {
  const auditApi = new Hono();

  auditApi.get("/", async (c) => {
      const limit = Number(c.req.query("limit")) || 50;
      const events = await auditService.getRecentEvents(limit);
      return c.json(events);
  });

  /**
   * Verifies the integrity of the audit log hash chain.
   * Returns whether any events have been tampered with or deleted.
   */
  auditApi.get("/verify", async (c) => {
      const limit = Number(c.req.query("limit")) || 1000;
      const result = await auditService.verifyChain(limit);
      
      if (!result.success) {
        return c.json({ error: "Failed to verify chain", details: result.error.message }, 500);
      }

      const data = result.data;
      const status = data.valid ? 200 : 409; 
      return c.json(data, status);
  });

  return auditApi;
}
