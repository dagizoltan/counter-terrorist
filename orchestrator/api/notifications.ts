import { Hono } from "hono";
import { notificationService } from "../services/alerts.ts";

const api = new Hono();

api.get("/", (c) => {
    return c.json(notificationService.getWebhooks());
});

api.post("/", async (c) => {
    const config = await c.req.json();
    const newWebhook = await notificationService.addWebhook(config);
    return c.json(newWebhook, 201);
});

api.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const success = await notificationService.deleteWebhook(id);
    return c.json({ success });
});

export default api;
