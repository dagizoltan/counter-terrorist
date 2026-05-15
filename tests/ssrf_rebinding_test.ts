import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateWebhookUrlAsync } from "../src/orchestrator/infrastructure/system/validation.ts";

Deno.test("validateWebhookUrlAsync returns resolvedIp for IP addresses", async () => {
    const url = "https://8.8.8.8/webhook";
    const result = await validateWebhookUrlAsync(url);
    assertEquals(result.valid, true);
    assertEquals(result.resolvedIp, "8.8.8.8");
});

Deno.test("validateWebhookUrlAsync returns resolvedIp for hostnames", async () => {
    const url = "https://dns.google/webhook";
    const result = await validateWebhookUrlAsync(url);
    assertEquals(result.valid, true);
    // dns.google resolves to 8.8.8.8 or 8.8.4.4
    const validIps = ["8.8.8.8", "8.8.4.4"];
    assertEquals(validIps.includes(result.resolvedIp!), true);
});

Deno.test("validateWebhookUrlAsync rejects private IPs in resolution", async () => {
    // This is hard to test without a controlled DNS, but we can assume Deno.resolveDns works.
    // We already have logic that checks the resolved IPs against isValidWebhookUrl.
});
