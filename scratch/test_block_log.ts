import { SovereignApp } from "./src/orchestrator/app.ts";
import { load } from "@std/dotenv";

await load({ export: true });
const app = new SovereignApp();
// We need to access the services, which are private in SovereignApp. 
// For testing purposes, I'll just check the logs after a simulated block.
// Since I can't easily access the private services, I'll look at the existing code in app.ts 
// and how it initializes the firewall.

// Alternative: check the output of a real block if I can trigger one.
// I'll look at the logs for any "BLOCK" event.
