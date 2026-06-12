import { assertEquals } from "jsr:@std/assert";
import { DecentralizedMetricsService } from "@domain/analysis/decentralized_metrics.ts";
import { EventBus } from "@domain/analysis/events.ts";
import { LoggingPort } from "@core/ports.ts";

const mockLogging: LoggingPort = {
    log: () => Promise.resolve(),
    logLegacy: () => Promise.resolve(),
    getRecentLogs: () => Promise.resolve([]),
    shutdown: () => Promise.resolve(),
    setConfig: () => {},
    setKv: () => {}
};

Deno.test("DecentralizedMetricsService - Aggregation and Broadcast", async () => {
    const bus = new EventBus(mockLogging);
    const service = new DecentralizedMetricsService(bus, mockLogging);

    let broadcasted: any = null;
    bus.on("UI_BROADCAST", (data: any) => {
        if (data.type === "METRICS_SUMMARY") {
            broadcasted = data.data;
        }
    });

    await bus.emit("METRIC_UPDATE", { domain: "test", data: { val: 1 } });

    // @ts-ignore
    await service.broadcastMetrics();

    assertEquals(broadcasted?.test?.val, 1);
});
