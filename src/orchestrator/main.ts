/**
 * GHOST_COMMAND: Sovereign Security Orchestrator
 * Entry point for the autonomous defense mesh.
 */
import { SovereignApp } from "./app.ts";

const app = new SovereignApp();

try {
    await app.boot();
} catch (error) {
    console.error("[CRITICAL] Sovereign Boot Failure:", error instanceof Error ? error.stack : error);
    Deno.exit(1);
}
