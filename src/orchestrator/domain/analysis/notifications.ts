import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { validateWebhookUrlAsync } from "@infrastructure/system/validation.ts";
import { safeFetch } from "@infrastructure/system/network.ts";
import { BaseService } from "@core/base_service.ts";
import { Result, ok } from "../../core/result.ts";

export interface WebhookConfig {
    id: string;
    name: string;
    url: string;
    type: "slack" | "discord" | "generic";
    enabled: boolean;
}

export class NotificationService extends BaseService {
    private webhooks: WebhookConfig[] = [];

    constructor(private kv: Deno.Kv, private logging: LoggingPort) {
        super();
    }

    protected override async onInit(): Promise<Result<void>> {
        await this.loadWebhooks();
        return ok(undefined);
    }

    protected override async onShutdown(): Promise<Result<void>> {
        return ok(undefined);
    }

    private async loadWebhooks() {
        try {
            const res = await this.kv.get<WebhookConfig[]>(["webhooks"]);
            if (res.value) {
                this.webhooks = res.value;
            }
        } catch (e) {
            this.logging.logLegacy(`[NOTIFICATIONS] Failed to load webhooks from KV: ${e}`, SyslogSeverity.ERROR);
        }
    }

    async addWebhook(webhook: Omit<WebhookConfig, "id">): Promise<WebhookConfig | { error: string }> {
        // Security: Validate webhook URL to prevent SSRF and DNS Rebinding
        const urlCheck = await validateWebhookUrlAsync(webhook.url);
        if (!urlCheck.valid) {
            this.logging.logLegacy(`[NOTIFICATIONS] Rejected webhook URL: ${urlCheck.reason}`, SyslogSeverity.WARNING);
            return { error: `Invalid webhook URL: ${urlCheck.reason}` };
        }

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
        if (event.type !== "CRITICAL" && event.type !== "LEDGER_TAMPER" && !event.type.startsWith("DRIFT")) {
            return; // Only notify on critical, ledger tampering, or drift events
        }
        for (const webhook of this.webhooks) {
            if (!webhook.enabled) continue;

            try {
                // Re-validate and resolve IP at notification time to prevent DNS rebinding
                const urlCheck = await validateWebhookUrlAsync(webhook.url);
                if (!urlCheck.valid || !urlCheck.resolvedIp) {
                    this.logging.logLegacy(`[NOTIFICATIONS] Webhook ${webhook.name} validation failed at notify time: ${urlCheck.reason}`, SyslogSeverity.ERROR);
                    continue;
                }

                let body = {};
                if (webhook.type === "slack") {
                    body = { text: `*[${event.type}]* ${event.message}\n\`\`\`${JSON.stringify(event.data || {}, null, 2)}\`\`\`` };
                } else if (webhook.type === "discord") {
                    body = { content: `**[${event.type}]** ${event.message}\n\`\`\`json\n${JSON.stringify(event.data || {}, null, 2)}\n\`\`\`` };
                } else {
                    body = event;
                }

                await safeFetch(webhook.url, urlCheck.resolvedIp, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
            } catch (e) {
                this.logging.logLegacy(`[NOTIFICATIONS] Failed to trigger webhook ${webhook.name}: ${e}`, SyslogSeverity.ERROR);
            }
        }
    }
}
