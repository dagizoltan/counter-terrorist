import { Hono } from "hono";
import { NotificationService } from "../../../services/index.ts";

export function createNotificationsApi(notificationService: NotificationService) {
  const api = new Hono();

  api.get("/", (c) => {
      return c.json(notificationService.getWebhooks());
  });

  api.post("/", async (c) => {
      const config = await c.req.json();
      const result = await notificationService.addWebhook(config);
      if ("error" in result) {
        return c.json({ success: false, error: result.error }, 400);
      }
      return c.json(result, 201);
  });

  api.delete("/:id", async (c) => {
      const id = c.req.param("id");
      const success = await notificationService.deleteWebhook(id);
      return c.json({ success });
  });

  return api;
}
