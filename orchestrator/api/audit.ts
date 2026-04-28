import { Hono } from "hono";
import { AuditService } from "../services/index.ts";

export function createAuditApi(auditService: AuditService) {
  const auditApi = new Hono();

  auditApi.get("/", async (c) => {
      const limit = Number(c.req.query("limit")) || 50;
      const events = await auditService.getRecentEvents(limit);
      return c.json(events);
  });

  return auditApi;
}
