import { Hono } from "hono";
import { serveStatic } from "hono/middleware.ts";
import { Dashboard } from "./views/Dashboard.tsx";
import { bootstrap } from "./bootstrapper.ts";

const app = new Hono();

// Bootstrap system info for the dashboard
const systemStatus = await bootstrap();

// Serve static assets (Web Components)
app.use("/static/*", serveStatic({ root: "./orchestrator/web" }));

// UI Routes
app.get("/", (c) => {
  return c.html(<Dashboard os={systemStatus.os} isRoot={systemStatus.isRoot} />);
});

app.get("/api/status", (c) => {
  return c.json(systemStatus);
});

// WebSocket Handler (Implementation in separate file)
app.get("/api/ws/events", (c) => {
  // To be implemented in Task 4
  return c.text("WebSocket Endpoint Placeholder");
});

console.log(`--- Security Orchestrator Web Console Running ---`);
console.log(`Local: http://localhost:8000`);

Deno.serve({ port: 8000 }, app.fetch);
