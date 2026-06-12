import { assertEquals } from "@std/assert";
import { GeoIpService } from "@domain/analysis/geoip_service.ts";

Deno.test("GeoIpService - Cache hit", async () => {
    const logging = { log: () => Promise.resolve() } as any;
    const gs = new GeoIpService(logging);

    // @ts-ignore
    gs.cache.set("1.1.1.1", { country: "TestLand", city: "TestCity" });

    const info = await gs.lookup("1.1.1.1");
    assertEquals(info.country, "TestLand");
});
