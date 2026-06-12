import { assertEquals } from "@std/assert";
import { VpnManager } from "@infrastructure/system/protection/vpn/vpn.ts";
import { VpnProvider, VpnResult } from "@infrastructure/system/protection/interfaces.ts";
import { EventBus } from "@domain/analysis/events.ts";

class MockVpnProvider implements VpnProvider {
    connected = false;
    async connect(iface: string): Promise<VpnResult> {
        this.connected = true;
        return { success: true, stdout: "Connected " + iface, stderr: "" };
    }
    async disconnect(): Promise<VpnResult> {
        this.connected = false;
        return { success: true, stdout: "Disconnected", stderr: "" };
    }
    async isConnected(): Promise<boolean> { return this.connected; }
    async getStatus(): Promise<any> { return { active: this.connected }; }
}

Deno.test("VpnManager - Connection lifecycle", async () => {
    const provider = new MockVpnProvider();
    const manager = new VpnManager(provider);

    const res = await manager.connect("wg1");
    assertEquals(res.success, true);
    assertEquals(await manager.isConnected(), true);

    await manager.disconnect();
    assertEquals(await manager.isConnected(), false);

    manager.shutdown();
});

Deno.test("VpnManager - Metrics emission", async () => {
    const provider = new MockVpnProvider();
    const manager = new VpnManager(provider);
    const bus = { emit: (event: string, data: any) => {
        if (event === "METRIC_UPDATE") {
            assertEquals(data.domain, "vpn");
            assertEquals(typeof data.data.active, "boolean");
        }
    }} as any;

    manager.setEventBus(bus);
    // @ts-ignore
    await manager.emitMetrics();

    manager.shutdown();
});
