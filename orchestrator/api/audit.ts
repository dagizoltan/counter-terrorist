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
      const status = result.valid ? 200 : 409; // 409 Conflict if tampered
      return c.json(result, status);
  });

  return auditApi;
}
