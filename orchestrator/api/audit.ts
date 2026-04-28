import { Hono } from "hono";
import { auditService } from "../services/audit.ts";

const auditApi = new Hono();

auditApi.get("/", async (c) => {
    const limit = Number(c.req.query("limit")) || 50;
    const events = await auditService.getRecentEvents(limit);
    return c.json(events);
});

export default auditApi;
