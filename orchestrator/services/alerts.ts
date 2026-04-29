import { LoggingPort, SyslogSeverity } from "../core/ports.ts";

export interface WebhookConfig {
    id: string;
    name: string;
    url: string;
    type: "slack" | "discord" | "generic";
    enabled: boolean;
}

export class NotificationService {
    private webhooks: WebhookConfig[] = [];

    constructor(private kv: Deno.Kv, private logging: LoggingPort) {
        this.loadWebhooks();
    }

    private async loadWebhooks() {
        try {
            const res = await this.kv.get<WebhookConfig[]>(["webhooks"]);
            if (res.value) {
                this.webhooks = res.value;
            }
        } catch (e) {
            this.logging.log(`[NOTIFICATIONS] Failed to load webhooks from KV: ${e}`, SyslogSeverity.ERROR);
        }
    }

    async addWebhook(webhook: Omit<WebhookConfig, "id">): Promise<WebhookConfig> {
        const newWebhook = { ...webhook, id: crypto.randomUUID() };
        this.webhooks.push(newWebhook);
        await this.saveWebhooks();
        return newWebhook;
    }

    async deleteWebhook(id: string): Promise<boolean> {
        const initialLength = this.webhooks.length;
        this.webhooks = this.webhooks.filter(w => w.id !== id);
        if (this.webhooks.length !== initialLength) {
            await this.saveWebhooks();
            return true;
        }
        return false;
    }

    private async saveWebhooks() {
        if (this.kv) {
            await this.kv.set(["webhooks"], this.webhooks);
        }
    }

    getWebhooks() {
        return this.webhooks;
    }

    async notify(event: { type: string; message: string; data?: any }) {
        if (event.type !== "CRITICAL" && !event.type.startsWith("DRIFT")) {
            return; // Only notify on critical or drift events
        }
        for (const webhook of this.webhooks) {
            if (!webhook.enabled) continue;

            try {
                let body = {};
                if (webhook.type === "slack") {
                    body = { text: `*[${event.type}]* ${event.message}\n\`\`\`${JSON.stringify(event.data || {}, null, 2)}\`\`\`` };
                } else if (webhook.type === "discord") {
                    body = { content: `**[${event.type}]** ${event.message}\n\`\`\`json\n${JSON.stringify(event.data || {}, null, 2)}\n\`\`\`` };
                } else {
                    body = event;
                }

                await fetch(webhook.url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
            } catch (e) {
                this.logging.log(`[NOTIFICATIONS] Failed to trigger webhook ${webhook.name}: ${e}`, SyslogSeverity.ERROR);
            }
        }
    }
}
