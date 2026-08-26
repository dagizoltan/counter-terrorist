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

Deno.test("a component's tone tokens never outrank the state that sets them", async () => {
  // The whole colour system funnels through --c / --c-wash / --c-edge, set
  // either by a state selector (.pill.ok, [data-state="ok"], .is-crit) or by a
  // component's own default.
  //
  // .pill, .status-pill, .indicator and .btn each set their default --c inside
  // the base rule, alongside display/padding/border. That is (0,1,0) — the
  // same specificity as [data-state="ok"] — and it sits LATER in the file, so
  // the default won every time. Every pill on every page rendered muted grey:
  // PASS and FAIL alike, "Armed" decoys, the shell's own "Perimeter Armed"
  // chip. Measured in Chromium, all of them came back rgb(118,128,147).
  //
  // The invariant: a rule that mixes tone tokens with ordinary properties is a
  // component default, and a default at single-class specificity shadows the
  // state that was meant to set it. Split the tokens into a :where() block, or
  // give the selector enough specificity to mean it.
  const css = await Deno.readTextFile(
    new URL("../src/orchestrator/interface/web/design/03-components.css", import.meta.url),
  );

  /** Split on commas at depth 0, so :where(a, b) stays one part. */
  const topLevelParts = (selector: string): string[] => {
    const parts: string[] = [];
    let depth = 0, current = "";
    for (const ch of selector) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      if (ch === "," && depth === 0) { parts.push(current); current = ""; continue; }
      current += ch;
    }
    parts.push(current);
    return parts.map((s) => s.trim()).filter(Boolean);
  };

  const offenders: string[] = [];
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");

  for (const match of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const block = match[2];
    if (selector.startsWith("@") || selector.startsWith(":root")) continue;
    if (!/(^|[\s;])--c(-wash|-edge)?\s*:/.test(block)) continue;

    // A rule that sets ONLY tone tokens is a state selector, which is exactly
    // what is supposed to win. Only a default mixed into a component's own
    // layout rule is at issue.
    const setsOrdinaryProperty = block
      .split(";")
      .some((d) => /^\s*[a-z-]+\s*:/.test(d) && !/^\s*--/.test(d));
    if (!setsOrdinaryProperty) continue;

    for (const part of topLevelParts(selector)) {
      if (part.includes(":where(")) continue;
      const classes = part.match(/\.[A-Za-z0-9_-]+/g) ?? [];
      // Two classes or an attribute already outrank [data-state="…"].
      if (classes.length >= 2 || part.includes("[")) continue;
      offenders.push(part);
    }
  }

  assertEquals(
    offenders,
    [],
    `tone token default(s) at class specificity — move them into a :where() ` +
      `block or they will shadow [data-state]:\n${offenders.join("\n")}`,
  );
});

Deno.test("every view forwards the CSP nonce to Layout", async () => {
  // Layout stamps props.nonce onto every <script> it emits. A view that
  // renders <Layout> without passing it through emits script tags with no
  // nonce — and under `script-src 'self' 'nonce-…' 'strict-dynamic'` the
  // browser refuses every one of them.
  //
  // Seven views did exactly that: all six agent subpages (firewall, ebpf, fim,
  // pcap, honeypot, mesh) and the generic agent detail page. Every island on
  // those pages was refused at load — measured in Chromium, the firewall page
  // logged ten "Refused to load the script" violations and rendered nine dead
  // custom elements. They had no working JavaScript at all.
  //
  // Each of the seven already declared `nonce?: string` in its props. They
  // just never forwarded it, which is precisely the kind of omission a types
  // check cannot see and a page-load never announces.
  const WEB_DIR = new URL("../src/orchestrator/interface/web/", import.meta.url);
  const offenders: string[] = [];

  async function scan(dir: URL) {
    for await (const entry of Deno.readDir(dir)) {
      const path = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
      if (entry.isDirectory) { await scan(path); continue; }
      if (!entry.name.endsWith(".tsx")) continue;

      const src = await Deno.readTextFile(path);
      // Layout itself is where the nonce lands; it has no Layout of its own.
      if (entry.name === "Layout.tsx") continue;

      for (const match of src.matchAll(/<Layout\b[^>]*?>/gs)) {
        if (match[0].includes("nonce")) continue;
        const line = src.slice(0, match.index).split("\n").length;
        offenders.push(`${path.href.split("/web/")[1]}:${line}`);
      }
    }
  }
  await scan(WEB_DIR);

  assertEquals(
    offenders,
    [],
    `view(s) rendering <Layout> without nonce — every script they emit will be ` +
      `refused by the CSP:\n${offenders.join("\n")}`,
  );
});

Deno.test("views do not hardcode a metric they cannot know", async () => {
  // Fabricated readouts have been the most persistent defect in this console.
  // Removed so far: "Trap Health 98.4%", four VPN cards reading
  // WIREGUARD / EU-CENTRAL / MAXIMUM / "24m 12s", "LATENCY: 42ms",
  // "Egress_Stability 99.9%", the sidebar trust meter's "99.9%" on every page,
  // "Integrity_Hash: Verified_Secure", "Audit_Stability: 99.99%_STABLE", the
  // Governance Ledger's "0.00% Tamper_Prob" / "1.4K" / "PASS GDPR/SOV" / "12
  // Live_Rules", and the mesh page's green "VERIFIED" Byzantine consensus pill.
  //
  // Every one looked authoritative and none had a source. On a security
  // console that is worse than a blank: it is an assurance nobody computed.
  //
  // The rule: a view may not ship a literal that looks like a live measurement.
  // Placeholders are fine — an em dash, "—", "AWAITING" — because they do not
  // claim anything. A real value has to arrive from an island at runtime.
  const WEB_DIR = new URL("../src/orchestrator/interface/web/", import.meta.url);

  // A number with a unit, or a verdict word, sitting alone between tags.
  const MEASUREMENT = /(?:^|>)\s*(\d[\d.,]*\s*(?:%|K|M|ms|GB|MB|\/s)|VERIFIED|ESTABLISHED|BALANCED|OPTIMAL|MAXIMUM|NOMINAL|PASS|STABLE|SECURE)\s*(?:<|$)/;

  const offenders: string[] = [];

  async function scan(dir: URL) {
    for await (const entry of Deno.readDir(dir)) {
      const path = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
      if (entry.isDirectory) { await scan(path); continue; }
      if (!entry.name.endsWith(".tsx")) continue;

      const src = await Deno.readTextFile(path);
      src.split("\n").forEach((line, i) => {
        // A line that interpolates is deriving its value, not asserting one.
        if (/>\s*\{/.test(line)) return;
        // Comments explain the removals above; they are not markup.
        if (/^\s*(\/\/|\/?\*|\{\/\*)/.test(line.trim())) return;
        if (!MEASUREMENT.test(line)) return;
        offenders.push(`${path.href.split("/web/")[1]}:${i + 1}  ${line.trim().slice(0, 88)}`);
      });
    }
  }
  await scan(WEB_DIR);

  assertEquals(
    offenders,
    [],
    `view(s) hardcoding a value that looks measured — render a placeholder and ` +
      `let an island supply the real figure:\n${offenders.join("\n")}`,
  );
});
