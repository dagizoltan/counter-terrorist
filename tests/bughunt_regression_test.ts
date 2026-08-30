/**
 * Regression tests for the bug-hunting pass.
 *
 * Each case below fails against the code as it stood before the corresponding fix.
 */
import { assertEquals } from "@std/assert";
import { isPrivateIp, isValidWebhookUrl, validateRequest } from "@infrastructure/system/validation.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { COMMAND_POLICIES } from "@infrastructure/system/execution_policy.ts";
import { SecurityMiddleware, resolveClientIp } from "@interface/middleware/security.ts";
import { signPayload, verifySignature } from "@core/crypto_utils.ts";
import { ApiKeysService } from "@domain/identity/api_keys.ts";
import { Hono } from "hono";

// ── SSRF: bracketed IPv6 literals ────────────────────────────────────────────
// URL.hostname keeps the brackets on an IPv6 literal, and isPrivateIp matched on the
// raw value, so every one of these walked past the webhook guard.

Deno.test("isPrivateIp - bracketed IPv6 literals are classified as private", () => {
  for (const host of [
    "[::1]", "[fe80::1]", "[fc00::1]", "[fd12:3456::1]",
    "[::ffff:127.0.0.1]", "[::ffff:192.168.1.1]", "[0:0:0:0:0:0:0:1]", "[::]",
  ]) {
    assertEquals(isPrivateIp(host), true, `${host} should be private`);
  }
});

Deno.test("isPrivateIp - fe80::/10 is covered beyond the fe8 prefix", () => {
  for (const host of ["fe80::1", "fe90::1", "fea0::1", "feb0::1"]) {
    assertEquals(isPrivateIp(host), true, `${host} is link-local`);
  }
  // fec0::/10 was deprecated site-local, not link-local, and is not in fc00::/7.
  assertEquals(isPrivateIp("fec0::1"), false);
});

Deno.test("isPrivateIp - the whole 127/8 loopback range is private", () => {
  assertEquals(isPrivateIp("127.0.0.1"), true);
  assertEquals(isPrivateIp("127.1.2.3"), true);
});

Deno.test("isPrivateIp - hostnames are not matched by IPv6 text prefixes", () => {
  // The old fc/fd/fe8 startsWith tests ran against any string, so ordinary domains
  // were reported private and their webhooks refused.
  for (const host of ["fcbarcelona.com", "fdic.gov", "fe8store.io", "example.com"]) {
    assertEquals(isPrivateIp(host), false, `${host} is a hostname, not a private IP`);
  }
});

Deno.test("isValidWebhookUrl - rejects bracketed IPv6 loopback and link-local", () => {
  for (const url of [
    "https://[fe80::1]/hook",
    "https://[::ffff:127.0.0.1]/hook",
    "https://[0:0:0:0:0:0:0:1]/hook",
    "https://[fc00::1]/hook",
  ]) {
    assertEquals(isValidWebhookUrl(url).valid, false, `${url} should be refused`);
  }
  assertEquals(isValidWebhookUrl("https://example.com/hook").valid, true);
});

// ── PCAP filename jailing ────────────────────────────────────────────────────
// netcap hands `filename` straight to File::create while holding CAP_NET_RAW, and the
// schema only inspected the trailing path component.

Deno.test("netcap schema - rejects traversal in the PCAP filename", () => {
  const traversals = [
    "../../../../etc/cron.d/evil",
    "/etc/cron.d/evil",
    "./volume/storage/../../../etc/passwd",
  ];
  for (const filename of traversals) {
    assertEquals(
      validateRequest("netcap", { type: "StartCapture", interface: "eth0", filename }),
      false,
      `${filename} should be refused`,
    );
    assertEquals(
      validateRequest("netcap", { type: "StartCapture", payload: { interface: "eth0", filename } }),
      false,
      `${filename} should be refused in the nested payload too`,
    );
  }
});

Deno.test("netcap schema - accepts the paths the real callers use", async () => {
  // Both spellings are in use: UbuntuPcapProvider sends the fields flat, the autopilot
  // nests them under `payload`. The jail must not break either.
  await Deno.mkdir("./volume/storage/forensics", { recursive: true });
  await Deno.mkdir("./volume/storage/captures", { recursive: true });

  assertEquals(
    validateRequest("netcap", { type: "StartCapture", interface: "eth0", filename: "capture-1.pcap" }),
    true,
  );
  const forensic = "./volume/storage/forensics/forensics_breach_a1b2c3d4.pcap";
  assertEquals(
    validateRequest("netcap", { type: "StartCapture", payload: { interface: "eth0", filename: forensic } }),
    true,
    "autopilot nested payload form",
  );
  assertEquals(
    validateRequest("netcap", { type: "StartCapture", interface: "eth0", duration: 60, filename: forensic }),
    true,
    "pcap provider flat form",
  );
  assertEquals(
    validateRequest("netcap", { type: "StartCapture", filename: "./volume/storage/captures/c.pcap" }),
    true,
  );
});

// ── `sh -c` policy ───────────────────────────────────────────────────────────
// The blanket shell-metacharacter scan rejected the very literals the sh policy
// authorises, so both call sites were unreachable.

function shAccepts(args: string[]): boolean {
  return COMMAND_POLICIES["sh"].schema!.safeParse(args).success;
}

Deno.test("sh policy - accepts the two authorised command shapes", () => {
  assertEquals(shAccepts(["-c", "echo '[kworker/u64:1]' > /proc/4242/comm"]), true);
  assertEquals(
    shAccepts(["-c", "umask 077 && echo 'profile cts {\n  /x r,\n}' > /var/lib/cts/tmp/cts-profile-nginx-a1b2c3d4.profile"]),
    true,
  );
});

Deno.test("sh policy - still refuses anything else", () => {
  assertEquals(shAccepts(["-c", "cat /etc/shadow"]), false);
  assertEquals(shAccepts(["-c", "umask 077 && echo 'x' > /etc/cron.d/evil"]), false);
  assertEquals(shAccepts(["-c", "echo 'x' > /proc/1/comm; id"]), false);
  assertEquals(shAccepts(["/etc/passwd"]), false);
  // Closing the quote to open a second redirect must not be accepted.
  assertEquals(
    shAccepts(["-c", "umask 077 && echo 'a' > /etc/passwd && echo 'b' > /var/lib/cts/tmp/cts-profile-x.profile"]),
    false,
  );
});

Deno.test("SystemExecutor - sh -c reaches execution instead of being blocked as a metacharacter violation", async () => {
  const executor = new SystemExecutor();
  const res = await executor.execute("sh", ["-c", `echo 'x' > /proc/${Deno.pid}/comm`]);
  // The command may or may not succeed depending on the sandbox, but it must no longer
  // be rejected by the validator before it runs.
  assertEquals(res.stderr.includes("Shell metacharacter"), false);
  assertEquals(res.stderr.includes("Structured validation failed"), false);
});

// ── Command whitelist: basename bypass ───────────────────────────────────────
// path.basename() was matched against the whitelist for any input, so a path whose
// last component happened to be whitelisted was executed.

Deno.test("SystemExecutor - a path is not whitelisted just because its basename is", async () => {
  const executor = new SystemExecutor();
  for (const cmd of ["/tmp/attacker/ls", "/tmp/attacker/systemctl", "./evil/sh", "/tmp/x/install_service.sh"]) {
    const res = await executor.execute(cmd, []);
    assertEquals(res.success, false, `${cmd} should be refused`);
    assertEquals(
      res.stderr.includes("is not in the system whitelist"),
      true,
      `${cmd} should be refused by the whitelist, got: ${res.stderr}`,
    );
  }
});

Deno.test("SystemExecutor - sidecar binaries are still resolvable by path", async () => {
  const executor = new SystemExecutor();
  // Not on disk here, so it cannot succeed — but it must get past the whitelist and be
  // rejected for some other reason, otherwise every sidecar launch breaks.
  const res = await executor.execute("./src/agents/target/release/analyzer", ["{\"type\":\"GetStatus\"}"]);
  assertEquals(res.stderr.includes("is not in the system whitelist"), false, res.stderr);
});

Deno.test("SystemExecutor - bare whitelisted names still work", async () => {
  const executor = new SystemExecutor();
  const res = await executor.execute("which", ["sh"]);
  assertEquals(res.stderr.includes("is not in the system whitelist"), false, res.stderr);
});

// ── Mesh authentication ──────────────────────────────────────────────────────
// meshAuth granted the mesh_peer role on the mere *presence* of an X-Mesh-Signature
// header, without verifying it. Only /api/mesh/sync checks the signature in its own
// handler, so /api/mesh/nodes and /api/mesh/resync were reachable unauthenticated.

const MESH_SECRET = "mesh-secret-for-tests";

function meshApp(): Hono {
  const services = {
    config: { getEnv: (_k: string) => undefined },
    mesh: {
      verifySignature: (payload: unknown, signature: string) =>
        verifySignature(payload as Record<string, unknown>, signature, MESH_SECRET),
    },
    threatIntel: { getBlacklist: () => new Set<string>() },
    rateLimit: { checkLimit: () => Promise.resolve({ allowed: true, count: 1, resetAt: 0, retryAfterMs: 0 }) },
    sessions: { validateSession: () => Promise.resolve({ success: false }) },
    apiKeys: { validateApiKey: () => Promise.resolve({ success: false }) },
    // deno-lint-ignore no-explicit-any
  } as any;

  const security = new SecurityMiddleware(services, "master-token");
  const app = new Hono();
  app.use("/api/mesh/*", security.meshAuth(MESH_SECRET));
  app.all("/api/mesh/*", (c) => c.json({ reached: true, role: c.get("role") }));
  return app;
}

Deno.test("meshAuth - an unverified X-Mesh-Signature does not grant mesh_peer", async () => {
  const res = await meshApp().request("/api/mesh/nodes", {
    headers: { "X-Mesh-Signature": "not-a-real-signature" },
  });
  assertEquals(res.status, 401, "an unauthenticated peer-topology read must be refused");
});

Deno.test("meshAuth - a forged signature on a POST body is refused", async () => {
  const res = await meshApp().request("/api/mesh/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mesh-Signature": "AAAA" },
    body: JSON.stringify({ type: "GOSSIP_LOCKDOWN" }),
  });
  assertEquals(res.status, 401);
});

Deno.test("meshAuth - a correctly signed payload is still accepted", async () => {
  const payload = { type: "GOSSIP_LOCKDOWN", sourceNode: "peer-1" };
  const signature = await signPayload(payload, MESH_SECRET);
  const res = await meshApp().request("/api/mesh/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Mesh-Signature": signature },
    body: JSON.stringify(payload),
  });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).role, "mesh_peer");
});

Deno.test("meshAuth - the pre-shared secret still authenticates a peer", async () => {
  const res = await meshApp().request("/api/mesh/nodes", {
    headers: { "X-Mesh-Secret": MESH_SECRET },
  });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).role, "mesh_peer");
});

// ── Client IP resolution ─────────────────────────────────────────────────────
// The login limiter read X-Forwarded-For directly, so a caller could take a fresh
// bucket on every attempt and brute-force the token at full request rate.

function ctxWith(headers: Record<string, string>, remote?: string) {
  return {
    req: { header: (name: string) => headers[name] },
    env: remote ? { remoteAddr: { hostname: remote } } : undefined,
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("resolveClientIp - X-Forwarded-For is ignored from an untrusted peer", () => {
  const c = ctxWith({ "X-Forwarded-For": "1.2.3.4" }, "203.0.113.9");
  assertEquals(resolveClientIp(c, ""), "203.0.113.9");
  assertEquals(resolveClientIp(c, "198.51.100.1"), "203.0.113.9");
});

Deno.test("resolveClientIp - X-Forwarded-For is honoured from a trusted proxy", () => {
  const c = ctxWith({ "X-Forwarded-For": "1.2.3.4, 10.0.0.1" }, "203.0.113.9");
  assertEquals(resolveClientIp(c, "203.0.113.9"), "1.2.3.4");
  assertEquals(resolveClientIp(c, " 198.51.100.1 , 203.0.113.9 "), "1.2.3.4");
});

Deno.test("resolveClientIp - falls back when there is no peer address", () => {
  assertEquals(resolveClientIp(ctxWith({}), ""), "unknown");
  assertEquals(resolveClientIp(ctxWith({ "X-Forwarded-For": "1.2.3.4" }), "203.0.113.9"), "unknown");
});

// ── API key listing ──────────────────────────────────────────────────────────

Deno.test("api key listing - the stored per-key salt is not part of the public shape", async () => {
  const kv = await Deno.openKv(":memory:");
  try {
    const logging = { log: () => Promise.resolve() };
    // deno-lint-ignore no-explicit-any
    const svc = new ApiKeysService(kv, logging as any);
    const created = await svc.createApiKey("reporting", "viewer");
    assertEquals(created.success, true);

    const listed = await svc.listApiKeys();
    assertEquals(listed.length, 1);
    assertEquals("salt" in listed[0], false, "listApiKeys must not expose the key salt");
    assertEquals(listed[0].name, "reporting");
    assertEquals(listed[0].role, "viewer");
  } finally {
    kv.close();
  }
});
