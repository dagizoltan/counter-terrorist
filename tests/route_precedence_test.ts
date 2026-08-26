import { assertEquals } from "@std/assert";
import { Hono } from "hono";

const ROUTES = new URL("../src/orchestrator/interface/web/routes/", import.meta.url).pathname;

// Mirrors registry.ts. Kept in step by hand: the registry sorts routes with
// this same comparator so a static path registers before a parametric sibling,
// because Hono 4.3.7 resolves by registration order, not specificity.
function buildRoutePath(folder: string): string {
  const raw = folder.replace(/^(ui|api)--/, "");
  const segs = raw.split("--").map((s) => (s.startsWith("[") && s.endsWith("]")) ? `:${s.slice(1, -1)}` : s);
  return `/${segs.join("/")}`;
}
function compareRoutePaths(a: string, b: string): number {
  const as = a.split("/"), bs = b.split("/");
  const n = Math.min(as.length, bs.length);
  for (let i = 0; i < n; i++) {
    const ap = as[i].startsWith(":"), bp = bs[i].startsWith(":");
    if (ap !== bp) return ap ? 1 : -1;
    if (as[i] !== bs[i]) return as[i] < bs[i] ? -1 : 1;
  }
  return as.length - bs.length;
}

function pathsFor(prefix: "ui" | "api"): string[] {
  return [...Deno.readDirSync(ROUTES)]
    .filter((e) => e.isDirectory && e.name.startsWith(`${prefix}--`))
    .map((e) => buildRoutePath(e.name));
}

/** Register the real route set (sorted) into Hono and return the app. */
function appFor(prefix: "ui" | "api", base: string): Hono {
  const app = new Hono();
  const b = app.basePath(base);
  for (const p of pathsFor(prefix).sort(compareRoutePaths)) {
    b.get(p, (c) => c.text(p));
  }
  return app;
}

Deno.test("a static UI route is not swallowed by a parametric sibling", async () => {
  // The regression: /agents/deception 404'd because /agents/:name was
  // registered first and its handler rejects the unknown name.
  const app = appFor("ui", "/");
  const res = await app.fetch(new Request("http://x/agents/deception"));
  assertEquals(await res.text(), "/agents/deception");

  // The parametric sibling still resolves for a real param value.
  const other = await app.fetch(new Request("http://x/agents/sentinel"));
  assertEquals(other.status, 200);
  assertEquals(await other.text(), "/agents/:name");
});

Deno.test("a static API route is not swallowed by a parametric sibling", async () => {
  // /api/agents/deception/canaries must beat /api/agents/deception/:id, or the
  // decoy-lookup handler 404s on module "canaries".
  // Handlers are registered on basePath("/api") and echo their base-relative
  // path, so the expected value carries no /api prefix.
  const app = appFor("api", "/api");
  const res = await app.fetch(new Request("http://x/api/agents/deception/canaries"));
  assertEquals(await res.text(), "/agents/deception/canaries");
});
