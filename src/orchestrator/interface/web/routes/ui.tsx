import { jsx } from "hono/jsx";
import { Hono, Context } from "hono";
import { SecurityMiddleware } from "../middleware/security.ts";
import { ServiceContainer } from "@core/container.ts";

/* Categorized Feature Routers */
import { createAgentsRouter } from "../features/infrastructure/agents/handler.tsx";
import { createHoneypotsRouter } from "../features/defense/deception/handler.tsx";
import { createSituationalRouter } from "../features/situational/handler.tsx";
import { createForensicRouter } from "../features/forensic/handler.tsx";
import { createSystemRouter } from "../features/system/handler.tsx";
import { createNetworkRouter } from "../features/infrastructure/network/handler.tsx";

/**
 * UI Router
 * Optimized for Operational Security (OpSec) Flow.
 */
export function createUiRouter(services: ServiceContainer, security: SecurityMiddleware, getStatus: () => Promise<any>) {
  const router = new Hono();

  // Root RBAC Enforcement
  router.use("*", security.requireRole("admin", "operator", "viewer"));

  // ── MONITOR & INTEL ───────────────────────────────────────────────
  
  router.get("/", (c) => c.redirect("/dashboard"));

  router.route("/", createSituationalRouter());

  // ── ANALYZE ───────────────────────────────────────────────────────

  router.route("/forensics", createForensicRouter());

  router.get("/infrastructure/mesh", async (c: Context) => {
    const { MeshTopologyPage } = await import("../features/infrastructure/mesh/page.tsx");
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<MeshTopologyPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  router.get("/intel/public-ip-collections", async (c: Context) => {
    const { default: IpIntelPage } = await import("../features/defense/ip_intel_page.tsx") as any;
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<IpIntelPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  router.get("/intel/artifact-collections", async (c: Context) => {
    const { default: ArtifactIntelPage } = await import("../features/defense/artifact_intel_page.tsx") as any;
    const { status, csrfToken, nonce, userRole } = c.get("uiContext");
    return c.html(<ArtifactIntelPage status={status} csrfToken={csrfToken} nonce={nonce} userRole={userRole} />);
  });

  // ── NETWORK ───────────────────────────────────────────────────────

  router.route("/network", createNetworkRouter());

  // ── AGENT FLEET ───────────────────────────────────────────────────

  router.get("/deception", (c) => c.redirect("/agents/deception"));
  router.get("/agents", (c) => c.redirect("/dashboard"));

  router.route("/agents/deception", createHoneypotsRouter(services.honeypot));
  router.route("/agents", createAgentsRouter(getStatus));

  // ── SYSTEM ────────────────────────────────────────────────────────

  router.route("/system", createSystemRouter());

  return router;
}
