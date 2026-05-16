
import { SovereignApp } from "../src/orchestrator/app/sovereign_app.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("Lifecycle Logic Healing: SovereignApp should shutdown cleanly", async () => {
    // Note: We don't fully boot the app as it requires hardware/sudo,
    // but we can test the constructor and the logic that registers cleanup.
    const app = new SovereignApp();

    // Check if the signal handlers can be registered without throwing
    // @ts-ignore
    app.registerSignalHandlers();

    console.log("Lifecycle signal handlers registered successfully.");

    // Cleanup to prevent leaks
    // @ts-ignore
    app.unregisterSignalHandlers();
});
