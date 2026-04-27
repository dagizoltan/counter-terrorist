import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { upgradeWebSocket, serveStatic } from "hono/deno";
import { Dashboard } from "./views/Dashboard.tsx";
import { bootstrap } from "./bootstrapper.ts";
import { wsHandler } from "./api/ws.ts";
import { firewall } from "./protection/firewall.ts";
import { vpn } from "./protection/vpn.ts";
import { antivirus } from "./protection/antivirus.ts";
import { baseline } from "./services/baseline.ts";

const app = new Hono();

const TOKEN = Deno.env.get("API_TOKEN");

if (!TOKEN) {
  console.error("CRITICAL ERROR: API_TOKEN environment variable is not set.");
  console.error("For security reasons, the orchestrator will not start without a defined token.");
  Deno.exit(1);
}

// Apply bearer auth to all /api/* routes
app.use("/api/*", (c, next) => {
  if (c.req.path === "/api/ws/events") {
    // WebSockets handle auth via query param (Milestone 1 requirement)
    const token = c.req.query("token");
    if (token !== TOKEN) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  }
  return bearerAuth({ token: TOKEN })(c, next);
});

// Bootstrap system info for the dashboard
const systemStatus = await bootstrap();

// Serve static assets (Web Components)
app.use("/static/*", serveStatic({
  root: "./orchestrator/web",
  rewriteRequestPath: (path) => path.replace(/^\/static/, "")
}));

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

app.post("/api/baseline/set", async (c) => {
  const result = await baseline.setBaseline();
  return c.json(result);
});

app.post("/api/baseline/check", async (c) => {
  const result = await baseline.checkDrift();
  return c.json(result || { message: "No baseline established" });
});

// WebSocket Handler
app.get(
  "/api/ws/events",
  upgradeWebSocket((_c) => wsHandler),
);

console.log(`--- Security Orchestrator Web Console Running ---`);
console.log(`Local: http://localhost:8000`);

Deno.serve({ port: 8000, hostname: "127.0.0.1" }, app.fetch);
