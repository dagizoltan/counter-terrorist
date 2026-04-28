import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { serveStatic, upgradeWebSocket } from "hono/deno";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "hono/helper/cookie/index.ts";
import { cors } from "hono/middleware/cors/index.ts";
import { Dashboard } from "./views/Dashboard.tsx";
import { Login } from "./views/Login.tsx";
import { bootstrap } from "./bootstrapper.ts";
import { wsHandler } from "./api/ws.ts";
import { firewall } from "./protection/firewall.ts";
import { vpn } from "./protection/vpn.ts";
import { antivirus } from "./protection/antivirus.ts";
import { rkhunter } from "./protection/rkhunter.ts";
import { persistence } from "./protection/persistence.ts";
import { pluginManager } from "./plugin_manager.ts";
import { HoneypotPlugin } from "./plugins/honeypot.ts";
import { SshHoneypotPlugin } from "./plugins/ssh_honeypot.ts";
import { RedisHoneypotPlugin } from "./plugins/redis_honeypot.ts";
import { baseline } from "./services/baseline.ts";
import { loggingService } from "./services/logging.ts";
import { meshManager } from "./services/mesh.ts";
import { meshAuth } from "./services/mesh_auth.ts";
import { commandManager } from "./command_manager.ts";
import { broadcast } from "./api/ws.ts";
import reportsApi from "./api/reports.ts";
import notificationsApi from "./api/notifications.ts";
import auditApi from "./api/audit.ts";

const app = new Hono();

// Enable global console interception to syslog (Phase 2 Requirement)
loggingService.enableGlobalIntercept();

const TOKEN = Deno.env.get("API_TOKEN");

if (!TOKEN) {
  console.error("CRITICAL ERROR: API_TOKEN environment variable is not set.");
  console.error(
    "For security reasons, the orchestrator will not start without a defined token.",
  );
  Deno.exit(1);
}

app.use(
  "/api/*",
  cors({
    origin: ["http://127.0.0.1:8000", "https://127.0.0.1:8000"],
    credentials: true,
  }),
);

import { timingSafeEqual } from "node:crypto";

const isTokenValid = (tokenToTest: string | undefined): boolean => {
  // If no token is set in environment, we might be in a bootstrap phase.
  // But for security, we require it.
  if (!TOKEN) return false;
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
await meshManager.init();
meshManager.startDiscovery();

// Handle eBPF events
commandManager.onEvent("ebpf", (data: any) => {
  if (data.type === "SYSCALL_EVENT") {
    let type = "INFO";
    if (data.syscall === "ptrace") {
      type = "CRITICAL";
    } else if (data.syscall === "mmap") {
      // In a real implementation we'd check for PROT_EXEC
      type = "WARN";
    }

    broadcast({
      type,
      message: `eBPF Alert: ${data.comm} (PID: ${data.pid}) called ${data.syscall}`,
      data: data
    });
  }
});

// Start eBPF sidecar
commandManager.getPersistentSidecar("ebpf").catch(err => {
  console.warn("[MAIN] Failed to start eBPF sidecar:", err.message);
});

// Initialize and Start Plugins
pluginManager.register(new HoneypotPlugin());
pluginManager.register(new SshHoneypotPlugin());
pluginManager.register(new RedisHoneypotPlugin());
pluginManager.startAll().catch(console.error);

// Serve static assets (Web Components)
app.use(
  "/static/*",
  serveStatic({
    root: "./public",
    rewriteRequestPath: (path) => path.replace(/^\/static/, ""),
  }),
);

app.get("/login", (c) => {
  // @ts-ignore: JSX component
  return c.html(Login());
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const password = body.password;

  if (typeof password === "string" && isTokenValid(password)) {
    const isTls = !!(Deno.env.get("TLS_CERT") && Deno.env.get("TLS_KEY"));
    setCookie(c, "session_token", TOKEN!, {
      httpOnly: true,
      secure: isTls,
      sameSite: "Strict",
      maxAge: 60 * 60 * 24, // 24 hours
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
  return c.html(
    Dashboard({ os: systemStatus.os, isRoot: systemStatus.isRoot }),
  );
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
      details: fwStatus.stdout || fwStatus.stderr,
    },
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

app.post("/api/protection/persistence/audit", async (c) => {
  const result = await persistence.audit();
  return c.json(result);
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

app.post("/api/mesh/sync", async (c) => {
  const payload = await c.req.json();
  if (payload.type === "GOSSIP_BLOCK") {
    console.log(`[MESH] Received Gossip Block for IP: ${payload.ip}`);
    const result = await firewall.blockIp(payload.ip);
    return c.json(result);
  }
  return c.json({ error: "Unknown gossip type" }, 400);
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
let cert = Deno.env.get("TLS_CERT") ? await Deno.readTextFile(Deno.env.get("TLS_CERT")!) : null;
let key = Deno.env.get("TLS_KEY") ? await Deno.readTextFile(Deno.env.get("TLS_KEY")!) : null;

// Fallback to Mesh Certificates if TLS env vars are not set
let caCert = null;
if (!cert || !key) {
  console.log("[MAIN] No TLS environment variables found. Using Mesh mTLS identity.");
  const nodeCert = await meshAuth.generateNodeCert(Deno.hostname() || "node-local");
  cert = nodeCert.cert;
  key = nodeCert.key;
  caCert = (await meshAuth.getRootCA()).cert;
}

if (cert && key) {
  console.log(`Local (HTTPS): https://${HOST}:${PORT}`);
  Deno.serve({
    port: PORT,
    hostname: HOST,
    cert: cert,
    key: key,
    // Enable client certificate verification for mTLS
    ...(caCert ? { caCerts: [caCert] } : {}),
  }, app.fetch);
} else {
  console.log(`Local (HTTP): http://${HOST}:${PORT}`);
  console.warn(
    "WARNING: Running without TLS. This is only recommended for local development.",
  );
  Deno.serve({ port: PORT, hostname: HOST }, app.fetch);
}
