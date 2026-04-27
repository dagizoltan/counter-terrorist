import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { upgradeWebSocket, serveStatic } from "hono/deno";
import { Dashboard } from "./views/Dashboard.tsx";
import { bootstrap } from "./bootstrapper.ts";
import { wsHandler } from "./api/ws.ts";
import { firewall } from "./protection/firewall.ts";
import { vpn } from "./protection/vpn.ts";
import { antivirus } from "./protection/antivirus.ts";
import { rkhunter } from "./protection/rkhunter.ts";
import { baseline } from "./services/baseline.ts";
import reportsApi from "./api/reports.ts";
import notificationsApi from "./api/notifications.ts";

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

// Start background monitoring
baseline.startMonitor();
vpn.startMonitor();

// Serve static assets (Web Components)
app.use("/static/*", serveStatic({
  root: "./orchestrator/web",
  rewriteRequestPath: (path) => path.replace(/^\/static/, "")
}));

// UI Routes
app.get("/", (c) => {
  // Use component as a function to avoid JSX syntax in this file
  // @ts-ignore: Dashboard is a JSX component
  return c.html(Dashboard({ os: systemStatus.os, isRoot: systemStatus.isRoot, token: TOKEN! }));
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

app.post("/api/protection/rkhunter/scan", async (c) => {
  const result = await rkhunter.runScan();
  return c.json(result);
});

app.get("/api/protection/rkhunter/status", (c) => {
  const result = rkhunter.getLastResult();
  return c.json(result || { message: "No scan performed yet" });
});

app.route("/api/reports", reportsApi);
app.route("/api/notifications", notificationsApi);

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

const PORT = Number(Deno.env.get("PORT")) || 8000;
const HOST = "127.0.0.1";

// Support for TLS (Milestone 2 Requirement)
const certFile = Deno.env.get("TLS_CERT");
const keyFile = Deno.env.get("TLS_KEY");

if (certFile && keyFile) {
  console.log(`Local (HTTPS): https://${HOST}:${PORT}`);
  Deno.serve({
    port: PORT,
    hostname: HOST,
    cert: await Deno.readTextFile(certFile),
    key: await Deno.readTextFile(keyFile),
  }, app.fetch);
} else {
  console.log(`Local (HTTP): http://${HOST}:${PORT}`);
  console.warn("WARNING: Running without TLS. This is only recommended for local development.");
  Deno.serve({ port: PORT, hostname: HOST }, app.fetch);
}
