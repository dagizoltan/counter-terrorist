/**
 * Every route directory must actually be loadable by the registry.
 *
 * `registry.ts` imports `<dir>/route.js` and swallows any failure with
 * `catch { continue; }`, so a directory with a wrong filename, a broken import or the
 * wrong module shape is silently dropped — the endpoint 404s in production with no
 * diagnostic anywhere. `api--network--sockets` shipped a `route.ts` exporting a
 * self-registering `default` function and was never served, while the dashboard's
 * ActiveSockets island called it on every render.
 *
 * The existing route tests enumerate these directories to build path lists, so an
 * unloadable route reads as served there too. These assertions close that gap.
 */
import { assert, assertEquals } from "@std/assert";

const ROUTES = new URL("../src/orchestrator/interface/web/routes/", import.meta.url);

/** Hono verbs the registry can dispatch to; anything else falls into its `api.use` branch. */
const HONO_VERBS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD", "ALL"];
const VALID_ROLES = ["admin", "operator", "viewer", "mesh_peer"];

function routeDirs(prefix: "ui" | "api"): string[] {
    return [...Deno.readDirSync(ROUTES)]
        .filter((e) => e.isDirectory && e.name.startsWith(`${prefix}--`))
        .map((e) => e.name)
        .sort();
}

// deno-lint-ignore no-explicit-any
async function loadRoute(dir: string): Promise<any> {
    return await import(new URL(`${dir}/route.js`, ROUTES).href);
}

Deno.test("every api route directory ships a route.js the registry can find", () => {
    const missing = routeDirs("api").filter((d) => {
        try {
            Deno.statSync(new URL(`${d}/route.js`, ROUTES));
            return false;
        } catch {
            return true;
        }
    });
    assertEquals(missing, [], "the registry only imports route.js, so these are silently unserved");
});

Deno.test("every ui route directory ships a route.js the registry can find", () => {
    const missing = routeDirs("ui").filter((d) => {
        try {
            Deno.statSync(new URL(`${d}/route.js`, ROUTES));
            return false;
        } catch {
            return true;
        }
    });
    assertEquals(missing, []);
});

Deno.test("every api route module imports and exposes a handler", async () => {
    const broken: string[] = [];
    for (const dir of routeDirs("api")) {
        try {
            const mod = await loadRoute(dir);
            if (!mod.handler && !mod.handlerFactory) broken.push(`${dir}: no handler or handlerFactory`);
        } catch (e) {
            broken.push(`${dir}: ${(e as Error).message}`);
        }
    }
    assertEquals(broken, [], "registry.ts swallows these import failures silently");
});

Deno.test("every ui route module imports and exposes a handler", async () => {
    const broken: string[] = [];
    for (const dir of routeDirs("ui")) {
        try {
            const mod = await loadRoute(dir);
            if (!mod.handler && !mod.handlerFactory) broken.push(`${dir}: no handler or handlerFactory`);
        } catch (e) {
            broken.push(`${dir}: ${(e as Error).message}`);
        }
    }
    assertEquals(broken, []);
});

Deno.test("every api route declares an authorization posture", async () => {
    const undeclared: string[] = [];
    for (const dir of routeDirs("api")) {
        const mod = await loadRoute(dir).catch(() => null);
        if (!mod) continue; // covered by the import test above
        if (mod.publicRoute === true) continue; // deliberate opt-out
        if (!Array.isArray(mod.authRoles)) {
            // The registry defaults to admin/operator/viewer, but on an API surface that
            // default should be a decision someone wrote down, not an omission.
            undeclared.push(dir);
        }
    }
    assertEquals(undeclared, [], "these fall through to the registry's default role set");
});

Deno.test("declared authRoles and methods are values the registry can act on", async () => {
    const bad: string[] = [];
    for (const dir of [...routeDirs("api"), ...routeDirs("ui")]) {
        const mod = await loadRoute(dir).catch(() => null);
        if (!mod) continue;

        for (const role of (mod.authRoles ?? [])) {
            if (!VALID_ROLES.includes(role)) bad.push(`${dir}: unknown role ${JSON.stringify(role)}`);
        }
        const methods = mod.methods ?? [mod.method ?? "GET"];
        for (const m of methods) {
            if (typeof m !== "string" || !HONO_VERBS.includes(m.toUpperCase())) {
                bad.push(`${dir}: unroutable method ${JSON.stringify(m)}`);
            }
        }
    }
    assertEquals(bad, []);
});

Deno.test("no api route grants a role that cannot authenticate to it", async () => {
    // mesh_peer is granted only by meshAuth, which is mounted per-route via
    // middlewareFactory. A route naming mesh_peer in authRoles without that factory
    // would declare a posture nothing can ever satisfy.
    const orphaned: string[] = [];
    for (const dir of routeDirs("api")) {
        const mod = await loadRoute(dir).catch(() => null);
        if (!mod) continue;
        if ((mod.authRoles ?? []).includes("mesh_peer") && !mod.middlewareFactory) {
            orphaned.push(dir);
        }
    }
    assertEquals(orphaned, []);
});

Deno.test("every /api/mesh route mounts its own auth gate", async () => {
    // web_adapter's global auth() pass skips /api/mesh/ so that meshAuth can run — a
    // mesh route without middlewareFactory would therefore be reachable with no
    // authentication at all.
    const ungated: string[] = [];
    for (const dir of routeDirs("api")) {
        if (!dir.startsWith("api--mesh--")) continue;
        const mod = await loadRoute(dir).catch(() => null);
        if (!mod) continue;
        if (typeof mod.middlewareFactory !== "function") ungated.push(dir);
    }
    assertEquals(ungated, [], "these would be exposed by the global auth() skip for /api/mesh/");
});

Deno.test("every /api/mesh route admits the role meshAuth grants", async () => {
    // meshAuth sets role=mesh_peer; requireRole runs straight after it. A mesh route
    // that omits mesh_peer from authRoles rejects the very peer it just authenticated.
    const mismatched: string[] = [];
    for (const dir of routeDirs("api")) {
        if (!dir.startsWith("api--mesh--")) continue;
        const mod = await loadRoute(dir).catch(() => null);
        if (!mod) continue;
        if (!(mod.authRoles ?? []).includes("mesh_peer")) mismatched.push(dir);
    }
    assertEquals(mismatched, []);
});

Deno.test("the sockets endpoint the dashboard calls is registered", async () => {
    const mod = await loadRoute("api--network--sockets");
    assert(mod.handlerFactory, "ActiveSockets.js calls /api/network/sockets on every render");
    assertEquals(mod.method, "GET");
    assertEquals(mod.authRoles, ["admin", "operator", "viewer"]);
});
