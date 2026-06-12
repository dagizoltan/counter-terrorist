import { assertEquals } from "@std/assert";
import { FirewallManager } from "@infrastructure/system/protection/firewall/firewall.ts";
import { FirewallProvider } from "@infrastructure/system/protection/interfaces.ts";
import { LoggingPort } from "@core/ports.ts";

class MockFirewallProvider implements FirewallProvider {
    blocked = new Set<string>();
    async blockIp(ip: string) { this.blocked.add(ip); return { success: true, stdout: "", stderr: "" }; }
    async unblockIp(ip: string) { this.blocked.delete(ip); return { success: true, stdout: "", stderr: "" }; }
    async getStatus() { return { success: true, stdout: Array.from(this.blocked).join("\n"), stderr: "" }; }
    async flushRules() { this.blocked.clear(); return { success: true, stdout: "", stderr: "" }; }
    async lockdown() { return { success: true, stdout: "", stderr: "" }; }
    async allowPort() { return { success: true, stdout: "", stderr: "" }; }
    async denyPort() { return { success: true, stdout: "", stderr: "" }; }
    async killProcess() { return { success: true, stdout: "", stderr: "" }; }
    async quarantineProcess() { return { success: true, stdout: "", stderr: "" }; }
    async enforcePid() { return { success: true, stdout: "", stderr: "" }; }
    async unenforcePid() { return { success: true, stdout: "", stderr: "" }; }
}

Deno.test("FirewallManager - Block and Unblock", async () => {
    const provider = new MockFirewallProvider();
    const manager = new FirewallManager(provider);

    await manager.blockIp("1.2.3.4");
    assertEquals(await manager.isBlocked("1.2.3.4"), true);

    await manager.unblockIp("1.2.3.4");
    assertEquals(await manager.isBlocked("1.2.3.4"), false);

    manager.shutdown();
});

Deno.test("FirewallManager - Hydration from KV", async () => {
    const kv = await Deno.openKv(":memory:");
    await kv.set(["enforcement", "5.6.7.8"], { reason: "TEST" });

    const provider = new MockFirewallProvider();
    const manager = new FirewallManager(provider);

    await manager.setKv(kv);
    assertEquals(await manager.isBlocked("5.6.7.8"), true);
    assertEquals(provider.blocked.has("5.6.7.8"), true);

    kv.close();
    manager.shutdown();
});
