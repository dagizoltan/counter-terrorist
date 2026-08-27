/**
 * Render-factory tests.
 *
 * Sixteen UI route handlers were byte-identical apart from the page component
 * they imported and the subset of uiContext fields they happened to pass on.
 * They now share one `renderPage(importer, exportName?)` factory
 * (routes/_render.ts), which hands every page the full uiContext superset plus
 * the route's path params. These tests pin the factory's contract and guard
 * against the sixteen copies growing back.
 *
 * The bespoke handlers — agents, agents/:name, deception, deception/:id, login —
 * do service lookups, dispatch, or 404 decisions and are deliberately excluded.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { renderPage } from "../src/orchestrator/interface/web/routes/_render.ts";

const ROUTES = new URL("../src/orchestrator/interface/web/routes/", import.meta.url);

/** Minimal stand-in for the Hono Context surface renderPage actually touches. */
function fakeCtx(uiContext: unknown, params: Record<string, string> = {}) {
  const seen = { html: undefined as unknown };
  const c = {
    get: (k: string) => (k === "uiContext" ? uiContext : undefined),
    req: { param: () => params },
    // The real c.html stringifies the JSX node; String() renders a hono/jsx
    // node and, in doing so, invokes the component so we can read its props.
    html: (node: unknown) => {
      seen.html = String(node);
      return new Response(seen.html as string, { headers: { "content-type": "text/html" } });
    },
  };
  return { c, seen };
}

Deno.test("renderPage selects a named export", async () => {
  let props: Record<string, unknown> | null = null;
  const Named = (p: Record<string, unknown>) => {
    props = p;
    return "named-ok";
  };
  const handler = renderPage(async () => ({ Named, default: () => "wrong" }), "Named");
  const { c } = fakeCtx({ csrfToken: "t" });
  const res = await handler(c as never);
  assertStringIncludes(await res.text(), "named-ok");
  assert(props !== null, "component was never invoked");
});

Deno.test("renderPage falls back to the default export when no name is given", async () => {
  let invoked = false;
  const Default = () => {
    invoked = true;
    return "default-ok";
  };
  const handler = renderPage(async () => ({ default: Default }));
  const { c } = fakeCtx({});
  assertStringIncludes(await (await handler(c as never)).text(), "default-ok");
  assert(invoked, "default export was never invoked");
});

Deno.test("renderPage hands the page the full uiContext superset", async () => {
  let props: Record<string, unknown> = {};
  const Page = (p: Record<string, unknown>) => {
    props = p;
    return "x";
  };
  const ui = { status: { ok: true }, csrfToken: "tok", nonce: "n0nce", hostname: "ct-node-01", userRole: "admin" };
  const handler = renderPage(async () => ({ Page }), "Page");
  await handler(fakeCtx(ui).c as never);
  for (const key of Object.keys(ui)) {
    assert(key in props, `uiContext.${key} was not passed to the page`);
  }
  assertEquals(props.userRole, "admin");
  assertEquals((props.status as { ok: boolean }).ok, true);
});

Deno.test("renderPage merges route params on top of the context", async () => {
  let props: Record<string, unknown> = {};
  const Page = (p: Record<string, unknown>) => {
    props = p;
    return "x";
  };
  const handler = renderPage(async () => ({ Page }), "Page");
  await handler(fakeCtx({ userRole: "operator" }, { id: "AP_ABC123" }).c as never);
  assertEquals(props.id, "AP_ABC123", "path param :id did not reach the page");
  assertEquals(props.userRole, "operator", "context field was lost when params merged");
});

Deno.test("renderPage tolerates a missing uiContext", async () => {
  const Page = (p: Record<string, unknown>) => (("userRole" in p) ? "has-role" : "no-role");
  const handler = renderPage(async () => ({ Page }), "Page");
  // undefined uiContext must not throw — it degrades to an empty prop set.
  assertStringIncludes(await (await handler(fakeCtx(undefined).c as never)).text(), "no-role");
});

Deno.test("renderPage throws when the named export is absent", async () => {
  const handler = renderPage(async () => ({ default: () => "x" }), "Missing");
  let threw = false;
  try {
    await handler(fakeCtx({}).c as never);
  } catch (e) {
    threw = true;
    assertStringIncludes((e as Error).message, "Missing");
  }
  assert(threw, "a missing export should be a loud failure, not a blank page");
});

// Route dirs whose handlers are intentionally bespoke (lookup / dispatch / 404).
const BESPOKE = new Set([
  "ui--agents",
  "ui--agents--[name]",
  "ui--agents--deception",
  "ui--agents--deception--[id]",
  "ui--login",
]);

async function simpleUiRouteDirs(): Promise<string[]> {
  const dirs: string[] = [];
  for await (const entry of Deno.readDir(ROUTES)) {
    if (!entry.isDirectory || !entry.name.startsWith("ui--")) continue;
    if (BESPOKE.has(entry.name)) continue;
    dirs.push(entry.name);
  }
  return dirs.sort();
}

Deno.test("every simple UI route uses the shared render factory", async () => {
  const offenders: string[] = [];
  for (const dir of await simpleUiRouteDirs()) {
    const src = await Deno.readTextFile(new URL(`${dir}/handler.ts`, ROUTES));
    // Must delegate to the factory and carry no hand-rolled render of its own.
    if (!/renderPage\s*\(/.test(src)) offenders.push(`${dir}: does not call renderPage`);
    if (/\bjsx\s*\(/.test(src)) offenders.push(`${dir}: still hand-renders with jsx()`);
  }
  assertEquals(offenders, [], `handler(s) drifted off the shared factory:\n${offenders.join("\n")}`);
});

Deno.test("every simple UI handler names a page export that exists", async () => {
  // The export name lives only in the renderPage(...) call. A typo there renders
  // `undefined` as a component — a blank page a types check cannot see. Resolve
  // each name against its real page module and require a component.
  const offenders: string[] = [];
  for (const dir of await simpleUiRouteDirs()) {
    const src = await Deno.readTextFile(new URL(`${dir}/handler.ts`, ROUTES));
    const call = src.match(
      /renderPage\(\s*\(\)\s*=>\s*import\(["']\.\/page\.tsx["']\)\s*(?:,\s*["']([^"']+)["']\s*)?\)/,
    );
    if (!call) {
      offenders.push(`${dir}: handler does not match the renderPage(() => import("./page.tsx"), ...) shape`);
      continue;
    }
    const exportName = call[1] ?? "default";
    const mod = await import(new URL(`${dir}/page.tsx`, ROUTES).href) as Record<string, unknown>;
    if (typeof mod[exportName] !== "function") {
      offenders.push(`${dir}: export "${exportName}" is not a component on page.tsx`);
    }
  }
  assertEquals(offenders, [], `handler(s) point at a missing page export:\n${offenders.join("\n")}`);
});
