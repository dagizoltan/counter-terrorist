import { Context } from "hono";
import { NotificationService } from "@domain/index.ts";

export const getWebhooksHandler = (notificationService: NotificationService) => (c: Context) => {
  return c.json(notificationService.getWebhooks());
};

export const addWebhookHandler = (notificationService: NotificationService) => async (c: Context) => {
  const config = await c.req.json();
  const result = await notificationService.addWebhook(config);
  if ("error" in result) {
    return c.json({ success: false, error: result.error }, 400);
  }
  return c.json(result, 201);
};

export const deleteWebhookHandler = (notificationService: NotificationService) => async (c: Context) => {
  const id = c.req.param("id");
  const success = await notificationService.deleteWebhook(id);
  return c.json({ success });
};
