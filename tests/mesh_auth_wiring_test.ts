/**
 * Route authorization has to hold up in the middleware chain the app actually builds.
 *
 * These tests drive the REAL registry (`registerRoutes`) over the REAL route modules,
 * behind web_adapter's own global middleware ordering, with a permissive stub
 * container. Mirroring the wiring in the test instead would let the test pass while
 * production stayed broken — which is exactly how these defects survived.
 *
 * Three of them combined to make peering impossible:
 *  - web_adapter's global auth() pass ran before route middleware, so a correctly
 *    signed peer was refused 401 before meshAuth could see it;
 *  - the registry pushed requireRole ahead of the route's own middleware, so the role
 *    check ran before anything could set a role;
 *  - registerUiRoutes mounted `basePath("/").use("*")` — matching /api/* as well — and
 *    gated it on the console triple, so an authenticated mesh_peer got 403 on every
 *    mesh endpoint even once the first two were fixed.
 * Every gossip sync, audit sync and lockdown propagation between nodes failed.
 */
import { assertEquals } from "@std/assert";
import { Hono } from "hono";
import { registerRoutes } from "@interface/routes/registry.ts";
import { SecurityMiddleware } from "@interface/middleware/security.ts";
import { signPayload, verifySignature } from "@core/crypto_utils.ts";

const MESH_SECRET = "mesh-secret-for-tests";
const MASTER_TOKEN = "master-token-for-tests";
const VIEWER_KEY = "ct_viewer_test_key";

/** Any property not named here resolves to a callable no-op Proxy. */
function stubContainer(): unknown {
    const real: Record<string, unknown> = {
        config: {
            getEnv: () => undefined,
            getMeshSecret: () => MESH_SECRET,
            getToken: () => MASTER_TOKEN,
            getNumber: (_k: string, d: number) => d,
            getBoolean: (_k: string, d: boolean) => d,
        },
        mesh: {
            verifySignature: (p: unknown, sig: string) =>
                verifySignature(p as Record<string, unknown>, sig, MESH_SECRET),
        },
        threatIntel: { getBlacklist: () => new Set<string>() },
        rateLimit: { checkLimit: () => Promise.resolve({ allowed: true, count: 1, resetAt: 0, retryAfterMs: 0 }) },
        sessions: { validateSession: () => Promise.resolve({ success: false }) },
        apiKeys: {
            validateApiKey: (key: string) =>
                Promise.resolve(key === VIEWER_KEY ? { success: true, data: "viewer" } : { success: false }),
        },
    };
    const stub: unknown = new Proxy(function () {} as unknown as Record<string, unknown>, {
        get(_t, prop: string) {
            if (prop in real) return real[prop];
            if (prop === "then") return undefined; // never look thenable to await
            return stub;
        },
        apply: () => stub,
    });
    return stub;
}

async function buildRealApp(): Promise<Hono> {
    const services = stubContainer();
    const security = new SecurityMiddleware(services as never, MASTER_TOKEN);
    const app = new Hono();

    // web_adapter.setupMiddleware() ordering
    app.use("*", security.hardenedHeaders());
    app.use("*", (c, next) => {
        const p = c.req.path;
        if (p === "/login" || p === "/logout" || p.startsWith("/assets/") || p.startsWith("/vendor/") || p === "/style.css") return next();
        if (p.startsWith("/api/mesh/")) return next();
        return security.auth()(c, next);
    });

    await registerRoutes(app as never, services as never, security, () => Promise.resolve({}));
    return app;
}

const json = { "Content-Type": "application/json" };

/** The sync handler rejects payloads more than 5 minutes old, so build one fresh. */
function freshPayload(overrides: Record<string, unknown> = {}) {
    return { type: "GET_STATUS", sourceNode: "peer-1", timestamp: Date.now(), ...overrides };
}

Deno.test("real wiring - a correctly signed peer is admitted to /api/mesh/sync", async () => {
    const app = await buildRealApp();
    const payload = freshPayload();
    const sig = await signPayload(payload, MESH_SECRET);
    const res = await app.request("/api/mesh/sync", {
        method: "POST",
        headers: { ...json, "X-Mesh-Signature": sig },
        body: JSON.stringify(payload),
    });
    assertEquals(res.status, 200, "a legitimate peer must not be refused");
});

Deno.test("real wiring - the pre-shared secret admits a peer to /api/mesh/sync", async () => {
    const app = await buildRealApp();
    const res = await app.request("/api/mesh/sync", {
        method: "POST",
        headers: { ...json, "X-Mesh-Secret": MESH_SECRET },
        body: JSON.stringify(freshPayload()),
    });
    assertEquals(res.status, 200);
});

Deno.test("real wiring - forged and absent mesh credentials are refused", async () => {
    const app = await buildRealApp();
    const payload = freshPayload();
    const body = JSON.stringify(payload);
    const sig = await signPayload(payload, MESH_SECRET);

    const cases: Array<[string, RequestInit]> = [
        ["a made-up signature", { method: "POST", headers: { ...json, "X-Mesh-Signature": "AAAA" }, body }],
        ["a signature over another payload", {
            method: "POST",
            headers: { ...json, "X-Mesh-Signature": sig },
            body: JSON.stringify(freshPayload({ sourceNode: "attacker" })),
        }],
        ["the wrong pre-shared secret", { method: "POST", headers: { ...json, "X-Mesh-Secret": "nope" }, body }],
        ["no credentials at all", { method: "POST", headers: { ...json }, body }],
    ];
    for (const [label, init] of cases) {
        const res = await app.request("/api/mesh/sync", init);
        assertEquals(res.status, 401, `${label} must be refused`);
    }
});

Deno.test("real wiring - mesh credentials do not authenticate a non-mesh route", async () => {
    const app = await buildRealApp();
    const sig = await signPayload(freshPayload(), MESH_SECRET);
    const res = await app.request("/api/status", { headers: { "X-Mesh-Signature": sig } });
    assertEquals(res.status, 401);
});

Deno.test("real wiring - ordinary token auth still reaches an api route", async () => {
    const app = await buildRealApp();
    const res = await app.request("/api/status", { headers: { Authorization: `Bearer ${MASTER_TOKEN}` } });
    assertEquals(res.status, 200);
});

Deno.test("real wiring - an unauthenticated api request is refused", async () => {
    const app = await buildRealApp();
    assertEquals((await app.request("/api/status")).status, 401);
});

Deno.test("real wiring - per-route roles still restrict a lesser role", async () => {
    // /api/admin/api-keys declares authRoles ['admin']. A viewer must not reach it,
    // and must still reach a viewer-level route — proving the per-route gate survived
    // scoping the console gate away from /api/*.
    const app = await buildRealApp();

    const denied = await app.request("/api/admin/api-keys", { headers: { "X-Api-Key": VIEWER_KEY } });
    assertEquals(denied.status, 403, "a viewer must not reach an admin-only route");

    const allowed = await app.request("/api/status", { headers: { "X-Api-Key": VIEWER_KEY } });
    assertEquals(allowed.status, 200, "a viewer must still reach a viewer-level route");
});
