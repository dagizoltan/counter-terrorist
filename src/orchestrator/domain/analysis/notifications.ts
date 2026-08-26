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

    /**
     * Deliver a clearly-labelled test payload to every enabled webhook, and
     * report per-webhook what happened.
     *
     * The console's "TEST_ALL" button had no endpoint behind it: it fetched
     * /api/infrastructure/system/protection/firewall/status — a path no route
     * serves — and then set its label to "TEST SENT" regardless, because a 404
     * resolves rather than throwing. It reported success every time and tested
     * nothing.
     *
     * notify() cannot serve this: it drops anything that is not CRITICAL,
     * LEDGER_TAMPER or DRIFT, and dressing a test up as CRITICAL would page
     * whoever is on the other end.
     */
    async sendTest(): Promise<Array<{ name: string; delivered: boolean; error?: string }>> {
        const results: Array<{ name: string; delivered: boolean; error?: string }> = [];

        for (const webhook of this.webhooks) {
            if (!webhook.enabled) {
                results.push({ name: webhook.name, delivered: false, error: "disabled" });
                continue;
            }
            try {
                await this.dispatch(webhook, {
                    type: "TEST",
                    message: "Counter-Terrorist test notification. No action required.",
                    data: { sentAt: new Date().toISOString() },
                });
                results.push({ name: webhook.name, delivered: true });
            } catch (e) {
                results.push({ name: webhook.name, delivered: false, error: e instanceof Error ? e.message : String(e) });
            }
        }

        return results;
    }

    /**
     * Send one event to one webhook. Throws so callers can report the failure;
     * notify() swallows and logs, sendTest() surfaces it to the operator.
     */
    private async dispatch(webhook: WebhookConfig, event: { type: string; message: string; data?: unknown }) {
        // Re-validate and resolve at send time to prevent DNS rebinding.
        const urlCheck = await validateWebhookUrlAsync(webhook.url);
        if (!urlCheck.valid || !urlCheck.resolvedIp) {
            throw new Error(urlCheck.reason || "URL validation failed");
        }

        let body: unknown = event;
        if (webhook.type === "slack") {
            body = { text: `*[${event.type}]* ${event.message}\n\`\`\`${JSON.stringify(event.data || {}, null, 2)}\`\`\`` };
        } else if (webhook.type === "discord") {
            body = { content: `**[${event.type}]** ${event.message}\n\`\`\`json\n${JSON.stringify(event.data || {}, null, 2)}\n\`\`\`` };
        }

        await safeFetch(webhook.url, urlCheck.resolvedIp, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
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
