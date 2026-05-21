import { Hono } from "hono";
import { registerRoutes } from "./src/orchestrator/interface/web/routes/registry.ts";
import { SecurityMiddleware } from "./src/orchestrator/interface/web/middleware/security.ts";
const app = new Hono();
const services = {
  rateLimit: { checkLimit: async () => ({ allowed: true, retryAfterMs: 0 }) },
  apiKeys: { validateApiKey: async () => ({ success: false, data: null }) },
  sessions: { validateSession: async () => ({ success: false, data: null }), createSession: async () => ({ success: false, data: { id: "x" } }), revokeSession: async () => {} },
  config: { getToken: () => "token", getSessionTTL: () => 24, getMeshSecret: () => "mesh-secret" },
  meshAuth: undefined,
  threatIntel: { getBlacklist: () => new Set() },
  networkLogs: { log: async () => {} },
  command: { isRunning: () => false },
  anonymization: undefined,
  protection: undefined,
  platformInfo: {},
};
const security = new SecurityMiddleware(services as any, "token");
await registerRoutes(app as any, services as any, security as any, async () => ({}));
const res = await app.fetch(new Request("https://example.com/login"));
console.log(res.status);
const txt = await res.text();
console.log(txt.slice(0, 200));
