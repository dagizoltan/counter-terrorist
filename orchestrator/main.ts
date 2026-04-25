import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { serveStatic } from "hono/middleware.ts";
import { Dashboard } from "./views/Dashboard.tsx";
import { bootstrap } from "./bootstrapper.ts";
import { handleWs } from "./api/ws.ts";
import { firewall } from "./protection/firewall.ts";
import { vpn } from "./protection/vpn.ts";
import { antivirus } from "./protection/antivirus.ts";

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

app.post("/api/protection/firewall/block", async (c) => {
  const { ip } = await c.req.json();
  const result = await firewall.blockIp(ip);
  return c.json(result);
});

app.get("/api/protection/vpn/status", async (c) => {
  const connected = await vpn.isConnected();
  return c.json({ connected });
});

app.get("/api/protection/av/status", async (c) => {
  const status = await antivirus.getStatus();
  return c.json(status);
});

// WebSocket Handler
app.get(
  "/api/ws/events",
  upgradeWebSocket((_c) => {
    return {
      onOpen(_event, ws) {
        handleWs(ws as unknown as WebSocket);
      },
    };
  }),
);

console.log(`--- Security Orchestrator Web Console Running ---`);
console.log(`Local: http://localhost:8000`);

Deno.serve({ port: 8000 }, app.fetch);
