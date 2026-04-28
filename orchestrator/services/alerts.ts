export interface WebhookConfig {
    id: string;
    name: string;
    url: string;
    type: "slack" | "discord" | "generic";
    enabled: boolean;
}

export class NotificationService {
    private webhooks: WebhookConfig[] = [];
    private kv: Deno.Kv | null = null;

    constructor() {
        this.initKv();
    }

    private async initKv() {
        try {
            this.kv = await Deno.openKv();
            const res = await this.kv.get<WebhookConfig[]>(["webhooks"]);
            if (res.value) {
                this.webhooks = res.value;
            }
        } catch (e) {
            console.error("[NOTIFICATIONS] Failed to initialize Deno KV:", e);
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

        console.log(`[NOTIFICATIONS] Sending alerts for event: ${event.type}`);

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
                console.error(`[NOTIFICATIONS] Failed to trigger webhook ${webhook.name}:`, e);
            }
        }
    }
}

