/**
 * UI render tests.
 *
 * The console is server-rendered, so a broken view is a broken string. These
 * tests render the shell and the rebuilt views and assert on the output —
 * they catch the failure mode that produced this suite in the first place:
 * markup that references a design which does not exist, and renders as
 * something plausible-looking but wrong.
 *
 * Deliberately import only the interface layer so the suite runs without the
 * orchestrator's runtime dependencies.
 */
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Layout } from "@interface/components/Layout.tsx";
import { Login } from "@interface/routes/ui--login/page.tsx";
import {
  Eyebrow,
  Indicator,
  Metric,
  StatusPill,
  TacticalPanel,
} from "@interface/components/Tactical.tsx";

const html = (node: unknown) => String(node);

const shell = (over: Record<string, unknown> = {}) =>
  html(Layout({
    title: "System Overview // Sovereign Overwatch",
    children: "CONTENT",
    csrfToken: "tok",
    nonce: "n0nce",
    hostname: "ct-node-01",
    userRole: "admin",
    ...over,
  }));

Deno.test("shell renders all three columns", () => {
  const out = shell();
  assertStringIncludes(out, "shell-sidebar");
  assertStringIncludes(out, "shell-main");
  assertStringIncludes(out, "shell-aside");
});

Deno.test("shell leaks no unresolved template expressions or undefined", () => {
  const out = shell();
  assert(!out.includes("${"), "unresolved template expression in rendered markup");
  assert(!out.includes('="undefined"'), "undefined rendered into an attribute");
  assert(!/>undefined</.test(out), "undefined rendered as text");
});

Deno.test("every script tag carries the CSP nonce", () => {
  const out = shell();
  const scripts = (out.match(/<script/g) ?? []).length;
  const nonces = (out.match(/nonce="n0nce"/g) ?? []).length;
  assertEquals(nonces, scripts, "a script tag is missing its nonce");
});

Deno.test("CSRF token stays in the meta tag and off window", () => {
  const out = shell();
  assertStringIncludes(out, 'name="csrf-token"');
  assert(!out.includes("window.csrfToken"), "CSRF token exposed on window (SEC-02)");
});

Deno.test("settings link is gated on the admin role", () => {
  assertStringIncludes(shell({ userRole: "admin" }), "/system/settings");
  assert(!shell({ userRole: "viewer" }).includes("/system/settings"));
  assert(!shell({ userRole: undefined }).includes("/system/settings"));
});

Deno.test("a danger pill never renders as success", () => {
  // Regression: `.status-pill.active` and `.status-pill.danger` were declared
  // in two separate blocks at equal specificity, so `status-pill danger active`
  // resolved to whichever came last in the file — green.
  assertStringIncludes(html(StatusPill({ status: "danger", label: "Blocked" })), 'data-state="crit"');
  assertStringIncludes(html(StatusPill({ status: "crit", label: "Blocked" })), 'data-state="crit"');
});

Deno.test("legacy status names map onto the state vocabulary", () => {
  const state = (s: string) => html(StatusPill({ status: s, label: "x" })).match(/data-state="(\w+)"/)?.[1];
  assertEquals(state("success"), "ok");
  assertEquals(state("active"), "ok");
  assertEquals(state("online"), "ok");
  assertEquals(state("warning"), "warn");
  assertEquals(state("error"), "crit");
  assertEquals(state("offline"), "crit");
  assertEquals(state("primary"), "info");
  assertEquals(state("neutral"), "idle");
});

Deno.test("an unrecognised status degrades to idle, never to a colour", () => {
  assertEquals(
    html(StatusPill({ status: "not-a-state", label: "?" })).match(/data-state="(\w+)"/)?.[1],
    "idle",
  );
});

Deno.test("indicators are decorative and hidden from assistive tech", () => {
  assertStringIncludes(html(Indicator({ status: "ok" })), 'aria-hidden="true"');
});

Deno.test("components emit fixed class names, never interpolated ones", () => {
  // `border-${color}` and `bg-${color}` produced class names no stylesheet
  // defined, so the styling silently evaporated.
  const out = html(TacticalPanel({ children: "b", title: "T", accent: "warn" })) +
    html(Eyebrow({ children: "L", tone: "primary" })) +
    html(Metric({ label: "CPU", value: 1 }));
  assert(!/class="[^"]*(undefined|\$\{)/.test(out), "interpolated class name in output");
  assert(!/class="[^"]*\s"/.test(out), "class attribute has a trailing space");
});

Deno.test("login view carries no inline styles", () => {
  // It previously held a 70-line <style> block plus 15 style="" attributes —
  // a fourth place where surfaces and spacing were defined.
  const out = html(Login({}));
  assert(!out.includes("<style"), "login still has an inline style block");
  assert(!/ style="/.test(out), "login still has inline style attributes");
});

Deno.test("login surfaces auth errors accessibly", () => {
  const withError = html(Login({ error: "Invalid token" }));
  assertStringIncludes(withError, 'role="alert"');
  assertStringIncludes(withError, "Invalid token");
  assert(!html(Login({})).includes("error-box"), "error box shown without an error");
});
