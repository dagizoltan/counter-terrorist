import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EventBus } from "../src/orchestrator/domain/analysis/events.ts";
import { loggingService } from "../src/orchestrator/infrastructure/system/logging.ts";

Deno.test({
    name: "EventBus: Parallel Execution & Timeout",
    sanitizeResources: false,
    sanitizeOps: false,
    fn: async () => {
        const bus = new EventBus(loggingService);
        let counter = 0;

        // Fast handler
        bus.on("test" as any, () => { counter++; });

        // Slow handler (should timeout but not block)
        bus.on("test" as any, async () => {
            // This promise will be orphaned on timeout, which is expected for 'safelyExecute'
            await new Promise(r => setTimeout(r, 5000));
            counter++;
        });

        bus.emit("test" as any, {});

        // Wait a bit for the fast one
        await new Promise(r => setTimeout(r, 500));
        assertEquals(counter, 1, "Fast handler should have finished");

        // Wait for timeout period (2s)
        await new Promise(r => setTimeout(r, 2000));
        assertEquals(counter, 1, "Slow handler should have timed out and not finished yet (or ever)");
    }
});
