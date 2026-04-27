import { loggingService, SecurityEvent } from "./logging.ts";

export interface WebhookConfig {
    url: string;
    type: "slack" | "discord" | "generic";
    enabled: boolean;
}

export class NotificationService {
    private webhooks: WebhookConfig[] = [];

    constructor() {
        const envWebhook = Deno.env.get("NOTIFICATION_WEBHOOK_URL");
        if (envWebhook) {
            this.webhooks.push({
                url: envWebhook,
                type: "generic",
                enabled: true
            });
            console.log("[NOTIFICATIONS] Initialized with environment webhook.");
        }
    }

    async sendAlert(event: SecurityEvent) {
        for (const webhook of this.webhooks) {
            if (!webhook.enabled) continue;

            try {
                let payload = {};
                if (webhook.type === "slack") {
                    payload = { text: `*CRITICAL SECURITY EVENT*: ${event.message}\nSource: ${event.source}\nType: ${event.type}` };
                } else if (webhook.type === "discord") {
                    payload = { content: `**CRITICAL SECURITY EVENT**: ${event.message}\nSource: ${event.source}\nType: ${event.type}` };
                } else {
                    payload = event;
                }

                await fetch(webhook.url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
            } catch (e) {
                console.error(`[NOTIFICATIONS] Failed to send webhook alert to ${webhook.url}:`, e);
            }
        }
    }
}

export const notificationService = new NotificationService();
