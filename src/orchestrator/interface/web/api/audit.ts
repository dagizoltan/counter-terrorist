import { Context } from "hono";
import { AuditService } from "@domain/index.ts";

export const getAuditEventsHandler = (auditService: AuditService) => async (c: Context) => {
  const limit = Number(c.req.query("limit")) || 50;
  const events = await auditService.getRecentEvents(limit);
  return c.json(events);
};

export const verifyAuditChainHandler = (auditService: AuditService) => async (c: Context) => {
  const limit = Number(c.req.query("limit")) || 1000;
  try {
    const result = await auditService.verifyChain(limit);
    const status = result.valid ? 200 : 409;
    return c.json(result, status);
  } catch (e) {
    return c.json({ error: "Failed to verify chain", details: (e as Error).message }, 500);
  }
};

export const getAuditStatusHandler = (auditService: AuditService) => async (c: Context) => {
  const status = await auditService.getChainStatus();
  return c.json(status);
};
