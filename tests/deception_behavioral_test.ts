import { assertEquals } from "@std/assert";
import { BehavioralService } from "@domain/analysis/behavioral_service.ts";
import { FirewallPort, LoggingPort } from "@core/ports.ts";
import { delay } from "jsr:@std/async";

Deno.test("BehavioralService - Honeypot Trigger Integration", async () => {
    let blockedIp = "";
    const mockFirewall: any = {
        blockIp: (ip: string) => { blockedIp = ip; return Promise.resolve({ success: true }); },
        shadowBanIp: () => Promise.resolve({ success: true })
    };

    const service = new BehavioralService(mockFirewall);
    // @ts-ignore: mark initialized
    service.initialized = true;

    // Simulate 10 honeypot hits from same IP with low entropy (fast bursts)
    // BehavioralService.calculateEntropy uses round(interval/100)*100
    // So 10ms delay will result in 0ms bucket for all intervals -> 0 entropy
    for (let i = 0; i < 10; i++) {
        await service.analyze("10.0.0.5");
        await delay(20);
    }

    assertEquals(blockedIp, "10.0.0.5");
});

Deno.test("BehavioralService - Entropy Calculation", async () => {
    const service = new BehavioralService({} as any);

    // @ts-ignore: Test private method
    const lowEntropy = service.calculateEntropy([100, 100, 100, 100]);
    assertEquals(lowEntropy, 0);

    // @ts-ignore: Test private method
    const highEntropy = service.calculateEntropy([100, 200, 300, 400]);
    assertEquals(highEntropy > 1, true);
});
