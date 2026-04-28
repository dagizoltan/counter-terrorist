import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { upgradeWebSocket, serveStatic } from "hono/deno";
import { getCookie, setCookie, deleteCookie } from "hono/helper/cookie/index.ts";
import { cors } from "hono/middleware/cors/index.ts";
import { Dashboard } from "./views/Dashboard.tsx";
import { Login } from "./views/Login.tsx";
import { bootstrap } from "./bootstrapper.ts";
import { wsHandler } from "./api/ws.ts";
import { firewall } from "./protection/firewall.ts";
import { vpn } from "./protection/vpn.ts";
import { antivirus } from "./protection/antivirus.ts";
import { rkhunter } from "./protection/rkhunter.ts";
import { baseline } from "./services/baseline.ts";
import reportsApi from "./api/reports.ts";
import notificationsApi from "./api/notifications.ts";
import auditApi from "./api/audit.ts";

const app = new Hono();

const TOKEN = Deno.env.get("API_TOKEN");

if (!TOKEN) {
  console.error("CRITICAL ERROR: API_TOKEN environment variable is not set.");
  console.error("For security reasons, the orchestrator will not start without a defined token.");
  Deno.exit(1);
}

app.use("/api/*", cors({
  origin: ['http://127.0.0.1:8000', 'https://127.0.0.1:8000'],
  credentials: true,
}));

import { timingSafeEqual } from "node:crypto";

const isTokenValid = (tokenToTest: string | undefined): boolean => {
  if (!tokenToTest) return false;
  // Use TextEncoder to safely handle any string length into a Uint8Array
  const encoder = new TextEncoder();
  const a = encoder.encode(tokenToTest);
  const b = encoder.encode(TOKEN!);
  // If lengths differ, timingSafeEqual will throw. Prevent this by checking length first,
  // but note that length check is a timing leak for token length. Usually acceptable.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

const authMiddleware = async (c: any, next: any) => {
  // Check cookie
  const sessionToken = getCookie(c, "session_token");
  if (isTokenValid(sessionToken)) {
    return next();
  }

  // Fallback to bearer auth for API clients
  const authHeader = c.req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const bearerToken = authHeader.substring(7);
    if (isTokenValid(bearerToken)) {
      return next();
    }
  }

  if (c.req.path === "/api/ws/events") {
    const token = c.req.query("token");
    if (isTokenValid(token)) {
      return next();
    }
  }

  // If UI request, redirect to login
  if (!c.req.path.startsWith("/api/")) {
    return c.redirect("/login");
  }

  return c.json({ error: "Unauthorized" }, 401);
};

app.use("/api/*", authMiddleware);

// Apply auth to UI routes except login
app.use("/", authMiddleware);

// Bootstrap system info for the dashboard
const systemStatus = await bootstrap();

// Start background monitoring
baseline.startMonitor();

// Serve static assets (Web Components)
app.use("/static/*", serveStatic({
  root: "./public",
  rewriteRequestPath: (path) => path.replace(/^\/static/, "")
}));

app.get("/login", (c) => {
  // @ts-ignore: JSX component
  return c.html(Login());
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const password = body.password;

  if (typeof password === "string" && isTokenValid(password)) {
    const certFile = Deno.env.get("TLS_CERT");
    const keyFile = Deno.env.get("TLS_KEY");
    const isSecure = !!(certFile && keyFile);

    setCookie(c, "session_token", TOKEN!, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "Strict",
      maxAge: 60 * 60 * 24 // 24 hours
    });
    return c.redirect("/");
  }

  return c.redirect("/login?error=1");
});

app.get("/logout", (c) => {
  deleteCookie(c, "session_token");
  return c.redirect("/login");
});

// UI Routes
app.get("/", (c) => {
  // Use component as a function to avoid JSX syntax in this file
  // @ts-ignore: Dashboard is a JSX component
  return c.html(Dashboard({ os: systemStatus.os, isRoot: systemStatus.isRoot }));
});

app.get("/api/status", (c) => {
  return c.json(systemStatus);
});

app.get("/api/agent/status", async (c) => {
  const fwStatus = await firewall.getStatus();

  // Check if blocker binary exists
  let blockerExists = false;
  try {
    const isWindows = Deno.build.os === "windows";
    const extension = isWindows ? ".exe" : "";
    const paths = [
      `./agents/target/release/blocker${extension}`,
      `./agents/target/debug/blocker${extension}`,
    ];
    for (const p of paths) {
      try {
        const info = await Deno.stat(p);
        if (info.isFile) {
          blockerExists = true;
          break;
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignore
  }

  return c.json({
    blocker_binary: blockerExists,
    firewall: {
      active: fwStatus.success && fwStatus.stdout.includes("Status: active"),
      details: fwStatus.stdout || fwStatus.stderr
    }
  });
});

app.post("/api/protection/firewall/block", async (c) => {
  const { ip } = await c.req.json();
  const result = await firewall.blockIp(ip);
  return c.json(result);
});

app.delete("/api/protection/firewall/block/:ip", async (c) => {
  const ip = c.req.param("ip");
  const result = await firewall.unblockIp(ip);
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
app.route("/api/audit", auditApi);

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
