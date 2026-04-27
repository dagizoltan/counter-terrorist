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
import { rkhunter } from "./protection/rkhunter.ts";

const app = new Hono();

const TOKEN = Deno.env.get("API_TOKEN") || "development-token";

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

// Start health monitoring for VPN
vpn.startMonitoring();

// Serve static assets (Web Components)
app.use("/static/*", serveStatic({
  root: "./orchestrator/web",
  rewriteRequestPath: (path) => path.replace(/^\/static/, "")
}));

// UI Routes
app.get("/", (c) => {
  return c.html(<Dashboard os={systemStatus.os} isRoot={systemStatus.isRoot} token={TOKEN} />);
});

app.get("/api/status", (c) => {
  return c.json(systemStatus);
});

app.get("/api/protection/firewall/status", async (c) => {
  const status = await firewall.getStatus();
  return c.json(status);
});

app.post("/api/protection/firewall/block", async (c) => {
  const { ip } = await c.req.json();
  const result = await firewall.blockIp(ip);
  return c.json(result);
});

app.post("/api/protection/firewall/unblock", async (c) => {
  const { ip } = await c.req.json();
  const result = await firewall.unblockIp(ip);
  return c.json(result);
});

app.post("/api/protection/firewall/killswitch", async (c) => {
  const { enabled, serverIp, interfaceName } = await c.req.json();
  let result;
  if (enabled) {
    result = await vpn.enableKillSwitch(serverIp, interfaceName);
  } else {
    result = await vpn.disableKillSwitch();
  }
  return c.json(result);
});

app.get("/api/protection/vpn/status", async (c) => {
  const connected = await vpn.isConnected();
  return c.json({ connected });
});

app.post("/api/protection/vpn/connect", async (c) => {
  const { interfaceName, serverIp } = await c.req.json().catch(() => ({}));
  const result = await vpn.connect(interfaceName, serverIp);
  return c.json(result);
});

app.post("/api/protection/vpn/disconnect", async (c) => {
  const result = await vpn.disconnect();
  return c.json(result);
});

app.get("/api/protection/av/status", async (c) => {
  const status = await antivirus.getStatus();
  return c.json(status);
});

app.post("/api/protection/av/scan", async (c) => {
  const { path } = await c.req.json();
  const result = await antivirus.scanPath(path);
  return c.json(result);
});

app.post("/api/protection/rkhunter/check", async (c) => {
  const result = await rkhunter.runCheck();
  return c.json(result);
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
