import { Hono } from "hono";
import { NotificationService } from "../services/index.ts";

export function createNotificationsApi(notificationService: NotificationService) {
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

  return api;
}
