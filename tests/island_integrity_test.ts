/**
 * Island integrity tests.
 *
 * The islands are browser modules, so the runtime never type-checks them and a
 * mistake surfaces only as a blank panel in the console. These are the static
 * invariants that would have caught the failures found in this pass:
 *
 *   - TimelineIsland.js carried `return ';` — an unterminated string. The whole
 *     module failed to parse, so <timeline-island> never registered and the
 *     forensic timeline was permanently blank.
 *   - 42 of 48 API reads ignored the { success, data } envelope that
 *     apiConsistencyMiddleware puts on every /api/* response, so the next
 *     .forEach/.map/.filter/.sort threw or silently rendered nothing.
 *   - Islands were referenced under /routes/..., a path the server does not
 *     serve, so they 404'd.
 *   - ThreatMap pulled Leaflet from unpkg.com and tiles from cartocdn.com,
 *     both blocked by the CSP and both unavailable on an air-gapped node.
 */
import { assert, assertEquals } from "@std/assert";

const WEB = new URL("../src/orchestrator/interface/web/", import.meta.url).pathname;
const ISLANDS = `${WEB}components/islands`;

function islandFiles(): string[] {
  return [...Deno.readDirSync(ISLANDS)]
    .filter((e) => e.isFile && e.name.endsWith(".js"))
    .map((e) => e.name)
    .sort();
}

Deno.test("every island parses as a module", async () => {
  // A syntax error takes the whole module with it: the custom element never
  // registers and its panel stays empty with no visible cause.
  const broken: string[] = [];
  for (const name of islandFiles()) {
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    try {
      new Function(`return async () => { ${""} }`); // guard against Function being unavailable
      // Parse as a module via a data URL, which is how the browser loads it.
      await import(`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(src)))}`)
        .catch((e) => {
          // Runtime errors (customElements undefined in Deno) are fine here;
          // only a SyntaxError means the file cannot parse.
          if (e instanceof SyntaxError) throw e;
        });
    } catch (e) {
      if (e instanceof SyntaxError) broken.push(`${name}: ${e.message}`);
    }
  }
  assertEquals(broken, [], `island(s) fail to parse:\n${broken.join("\n")}`);
});

Deno.test("every API response read goes through the envelope helper", async () => {
  // apiConsistencyMiddleware wraps every /api/* JSON response as
  // { success, data }. Reading `res.json()` directly hands the caller the
  // envelope where it expects the payload.
  const offenders: string[] = [];
  for (const name of islandFiles()) {
    if (name === "api.js") continue;
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    src.split("\n").forEach((line, i) => {
      if (/\.json\(\)/.test(line) && !/JSON\.parse/.test(line)) {
        offenders.push(`${name}:${i + 1}  ${line.trim().slice(0, 80)}`);
      }
    });
  }
  assertEquals(offenders, [], `raw .json() read(s) — use unwrap() from api.js:\n${offenders.join("\n")}`);
});

Deno.test("no island reaches for an external origin", async () => {
  // The CSP is default-src 'self'. Anything fetched from a CDN is blocked, and
  // on an air-gapped node it would be unreachable regardless.
  const offenders: string[] = [];
  for (const name of islandFiles()) {
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    for (const m of src.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
      const url = m[0];
      if (/^https?:\/\/(www\.)?w3\.org/.test(url)) continue;      // SVG namespace
      if (/localhost|127\.0\.0\.1/.test(url)) continue;
      offenders.push(`${name}: ${url}`);
    }
  }
  assertEquals(offenders, [], `external origin(s) referenced:\n${offenders.join("\n")}`);
});

Deno.test("island scripts are referenced from a path the server serves", async () => {
  // web_adapter serves /style.css, /vendor/*, /assets/* and /components/*.
  // Anything else 404s, which is how CausalLineageIsland silently disappeared.
  const SERVED = ["/components/", "/vendor/", "/assets/"];
  const offenders: string[] = [];

  for await (const entry of Deno.readDir(`${WEB}routes`)) {
    if (!entry.isDirectory) continue;
    const page = `${WEB}routes/${entry.name}/page.tsx`;
    const src = await Deno.readTextFile(page).catch(() => null);
    if (!src) continue;
    for (const m of src.matchAll(/['"](\/[^'"]*islands\/[^'"]+\.js)['"]/g)) {
      if (!SERVED.some((p) => m[1].startsWith(p))) {
        offenders.push(`${entry.name}: ${m[1]}`);
      }
    }
  }
  assertEquals(offenders, [], `island path(s) the server does not serve:\n${offenders.join("\n")}`);
});

Deno.test("every element ID an island looks up is actually created somewhere", async () => {
  // Using getElementById is fine when the island rendered that element itself.
  // The bug was TimelineIsland looking up five IDs (timeline-events, -total,
  // -critical, -blocks, -markers) that no island and no page ever created, so
  // every render() and updateStats() bailed at its `if (!el) return` guard and
  // the component quietly dropped the data it had just fetched.
  // Every .tsx under the web tree: pages, subpages, detail views and shared
  // components can all be the one that declares the element.
  const haystack: string[] = [];
  async function collect(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) await collect(path);
      else if (entry.name.endsWith(".tsx")) haystack.push(await Deno.readTextFile(path));
    }
  }
  await collect(WEB.replace(/\/$/, ""));

  const dangling: string[] = [];
  for (const name of islandFiles()) {
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    for (const m of src.matchAll(/document\.getElementById\(\s*['"]([^'"]+)['"]/g)) {
      const id = m[1];
      const declared = src.includes(`id="${id}"`) || src.includes(`id='${id}'`) ||
        haystack.some((h) => h.includes(`id="${id}"`) || h.includes(`id='${id}'`));
      if (!declared) dangling.push(`${name}: #${id} is never created`);
    }
  }
  assertEquals(dangling, [], `island(s) render into an element that does not exist:\n${dangling.join("\n")}`);
});

Deno.test("the CSP declares no external origins", async () => {
  const src = await Deno.readTextFile(`${WEB}middleware/security.ts`);
  const csp = src.match(/"Content-Security-Policy",\s*`([^`]+)`/)?.[1] ?? "";
  assert(csp.length > 0, "CSP header not found");
  const externals = [...csp.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]);
  assertEquals(externals, [], `CSP still allows external origin(s): ${externals.join(", ")}`);
});

Deno.test("nothing renders an inline event handler, view or island", async () => {
  // The CSP is `script-src 'self' 'nonce-…' 'strict-dynamic'`. A nonce makes
  // the browser ignore 'unsafe-inline', so inline handlers are refused
  // outright — verified in Chromium, which logs "Refused to execute inline
  // event handler".
  //
  // Two rounds of these were found. First the views: the sidebar toggle, the
  // forensic aside tabs, and 12 action buttons across 7 pages. Then — after a
  // page-load sweep came back clean — another 24 inside island template
  // strings: every filter tab on the threat and artifact explorers, the
  // scanner's mode buttons, the pcap start button, "Terminate" on the process
  // tree, "Purge" on the agent detail.
  //
  // The second round hid because Chromium reports the refusal when the
  // handler would RUN, not when the attribute is parsed. Loading the page
  // logged nothing; the controls just did nothing when clicked. So this test
  // has to read the island sources, which is what it does — .tsx and .js
  // alike.
  //
  // Use data-action: the delegated handler in Layout.tsx for views,
  // bindActions() from islands/actions.js for islands.
  const offenders: string[] = [];

  async function scan(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) { await scan(path); continue; }
      if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".js")) continue;
      const src = await Deno.readTextFile(path);
      src.split("\n").forEach((line, i) => {
        // An inline handler ATTRIBUTE: whitespace, on<name>, then a quoted or
        // braced value. This deliberately does not match `el.onclick = () =>`,
        // a property assignment from script, which the CSP permits; nor
        // `data-on="change"`, where `on` is not preceded by whitespace.
        if (/\son[a-z]+\s*=\s*["'{]/.test(line) && !/addEventListener/.test(line)) {
          offenders.push(`${path.split("/web/")[1]}:${i + 1}`);
        }
      });
    }
  }
  await scan(WEB.replace(/\/$/, ""));

  assertEquals(offenders, [], `inline event handler(s) the CSP will refuse to run:\n${offenders.join("\n")}`);
});

Deno.test("island action names never collide with the shell's own", async () => {
  // Two delegated listeners read data-action: the shell's, on document (see
  // Layout.tsx), and each island's, on its host (islands/actions.js). The
  // shell's whitelist is what keeps them apart. An island that named an action
  // "post" or "reload" would have both fire — the island's method AND a stray
  // fetch or a page reload on top of it.
  const SHELL_ACTIONS = ["reload", "post", "invoke", "call"];

  const collisions: string[] = [];
  for (const name of islandFiles()) {
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    for (const m of src.matchAll(/data-action="([A-Za-z][A-Za-z0-9_]*)"/g)) {
      if (SHELL_ACTIONS.includes(m[1])) collisions.push(`${name}: data-action="${m[1]}"`);
    }
  }

  assertEquals(
    collisions,
    [],
    `island action name(s) shadowed by the shell's delegated handler:\n${collisions.join("\n")}`,
  );
});

Deno.test("islands escape the remote strings they write into innerHTML", async () => {
  // Islands build markup as strings and assign it to innerHTML, so every value
  // reaching a template has to be escaped on the way in. Several were not:
  //
  //   ThreatExplorer / ArtifactExplorer — indicator, provider, threatType and
  //     the whole geo block, all straight from third-party threat feeds.
  //   ProcessTree — node.comm, which is whatever a process called itself.
  //   NetworkMap  — d.ip / d.mac / d.type, chosen by the neighbour on the wire.
  //   NewsFeed    — item.title / item.summary, and item.link written directly
  //     into an href, where a javascript: URL is script the CSP never sees as
  //     inline.
  //
  // The CSP blocks an injected <script> and inline handlers, so this was not
  // remote code execution — style-src no longer permits inline either — but
  // broken markup corrupts the view either way.
  //
  // Only template literals that actually build markup are checked: a template
  // with no `<` in it is a Set key, an error string, or an SVG viewBox, and
  // escaping those would be noise. Inside a markup template the rule has no
  // exceptions — a constant costs nothing to escape, and an exception list is
  // one more thing to get wrong.
  const suspects: string[] = [];

  /**
   * Every backtick region in `src`, nested ones included, as [start, end).
   *
   * Nesting matters: an interpolation is judged by the INNERMOST template it
   * sits in. `this.busy.has(\`block:${ip}\`)` appears inside a markup
   * template, but its own template is a Set key with no markup in it.
   */
  function templateLiterals(src: string, base = 0): Array<[number, number]> {
    const spans: Array<[number, number]> = [];
    for (let i = 0; i < src.length; i++) {
      if (src[i] !== "`" || src[i - 1] === "\\") continue;
      let depth = 0;
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === "\\") { j++; continue; }
        if (src[j] === "$" && src[j + 1] === "{") { depth++; j++; continue; }
        if (src[j] === "}" && depth > 0) { depth--; continue; }
        if (src[j] === "`" && depth === 0) break;
      }
      spans.push([base + i, base + j]);
      spans.push(...templateLiterals(src.slice(i + 1, j), base + i + 1));
      i = j;
    }
    return spans;
  }

  /** Innermost span containing `at`, or null. */
  function innermost(spans: Array<[number, number]>, at: number): [number, number] | null {
    let best: [number, number] | null = null;
    for (const span of spans) {
      if (at <= span[0] || at >= span[1]) continue;
      if (!best || (span[1] - span[0]) < (best[1] - best[0])) best = span;
    }
    return best;
  }

  for (const name of islandFiles()) {
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    if (!/innerHTML\s*=/.test(src)) continue;
    if (!/apiGet|apiSend|unwrap|fetch\(/.test(src)) continue;

    const spans = templateLiterals(src);

    for (const match of src.matchAll(/\$\{\s*([A-Za-z_$][\w$]*(?:\??\.[\w$]+)+)\s*\}/g)) {
      const expr = match[1];
      if (expr.startsWith("this.")) continue;

      const span = innermost(spans, match.index);
      // Not inside a template, or inside one that builds no markup.
      if (!span || !/<[a-zA-Z/]/.test(src.slice(span[0], span[1]))) continue;

      // A value declared as a literal in this same file is not remote data.
      const root = expr.split(/[.?]/)[0];
      if (new RegExp(`^const ${root}\\s*=\\s*[[{]`, "m").test(src)) continue;

      const before = src.slice(Math.max(0, match.index - 24), match.index + match[0].length);
      if (/\$\{\s*(?:esc|escapeHTML|globalThis\.escapeHTML|window\.escapeHTML)\s*\(/.test(before)) continue;

      const line = src.slice(0, match.index).split("\n").length;
      suspects.push(`${name}:${line}  \${${expr}}`);
    }
  }

  assertEquals(
    suspects,
    [],
    `unescaped interpolation(s) inside markup — wrap in the escape helper:\n${suspects.join("\n")}`,
  );
});

Deno.test("every /api/ path an island calls is served by a route", async () => {
  // Three separate controls have shipped pointing at a URL with nothing behind
  // it, and every one of them looked like it worked:
  //
  //   the deception toggle posted to /agents/deception/api/:id/toggle;
  //   the process tree's Terminate posted to /api/processes/kill/:pid;
  //   the webhook "TEST_ALL" button still fetches
  //     /api/infrastructure/system/protection/firewall/status
  //     and then sets its label to "TEST SENT" regardless — a 404 resolves,
  //     it does not throw, so the catch block never runs.
  //
  // Route folders map to paths by convention: api--a--b--[c] serves
  // /api/a/b/:c. That makes the whole surface checkable from disk.
  const routes = [...Deno.readDirSync(`${WEB}routes`)]
    .filter((e) => e.isDirectory && e.name.startsWith("api--"))
    .map((e) =>
      "/api/" + e.name.slice("api--".length).split("--")
        .map((seg) => (seg.startsWith("[") ? ":param" : seg)).join("/")
    );

  /** A call matches a route when every segment lines up, `:param` and `${…}` matching anything. */
  const isServed = (call: string) => {
    const callSegs = call.replace(/\/+$/, "").split("/");
    return routes.some((route) => {
      const routeSegs = route.split("/");
      if (routeSegs.length !== callSegs.length) return false;
      return routeSegs.every((r, i) =>
        r === callSegs[i] || r === ":param" || callSegs[i].includes("${")
      );
    });
  };

  const unserved: string[] = [];
  for (const name of islandFiles()) {
    const src = (await Deno.readTextFile(`${ISLANDS}/${name}`))
      // Drop comments: the api.js docblock cites /api/x as an example.
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    for (const match of src.matchAll(/["'`](\/api\/[^"'`?\s]*)/g)) {
      if (isServed(match[1])) continue;
      const line = src.slice(0, match.index).split("\n").length;
      unserved.push(`${name}:${line}  ${match[1]}`);
    }
  }

  assertEquals(
    unserved,
    [],
    `island(s) calling a path no route serves — the request 404s and the ` +
      `control reports nothing:\n${unserved.join("\n")}`,
  );
});

Deno.test("nothing ships an inline style attribute, and the CSP forbids one", async () => {
  // Measured in Chromium under `style-src 'self'`:
  //
  //   style="" in parsed HTML   -> BLOCKED
  //   style="" via innerHTML    -> BLOCKED
  //   el.style.setProperty()    -> APPLIED
  //   class from external sheet -> APPLIED
  //
  // So the attribute had to go everywhere before the directive could be
  // tightened: 39 sites in the views and 36 in the islands. Static ones became
  // design-layer classes; dynamic ones became data-state (tone) or data-value
  // (position, fill, opacity), applied through setProperty by the shell.
  //
  // Both halves are asserted together because either alone is a trap — a
  // tightened header with one attribute left is a broken page, and a clean
  // tree under a loose header invites the next one straight back in.
  const security = await Deno.readTextFile(
    new URL("../src/orchestrator/interface/web/middleware/security.ts", import.meta.url),
  );
  // Match inside the header string itself, not the prose around it: the
  // comment above the directive discusses style-src by name and matched first.
  const header = /"Content-Security-Policy",\s*`([^`]+)`/.exec(security);
  if (!header) throw new Error("no Content-Security-Policy header found");
  const directive = /style-src ([^;]+);/.exec(header[1]);
  if (!directive) throw new Error("no style-src directive in the CSP header");
  assertEquals(
    directive[1].trim(),
    "'self'",
    "style-src must stay at 'self' — an inline style attribute is refused either way, " +
      "so re-adding 'unsafe-inline' buys nothing and reopens the hole",
  );

  const offenders: string[] = [];
  async function scan(dir: string) {
    for await (const entry of Deno.readDir(dir)) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) { await scan(path); continue; }
      if (!entry.name.endsWith(".tsx") && !entry.name.endsWith(".js")) continue;

      const src = await Deno.readTextFile(path);
      src.split("\n").forEach((line, i) => {
        // Comments across these files discuss the attribute by name.
        if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line.trim())) return;
        if (!/\sstyle\s*=\s*["'{]/.test(line)) return;
        offenders.push(`${path.split("/web/")[1]}:${i + 1}`);
      });
    }
  }
  await scan(WEB.replace(/\/$/, ""));

  assertEquals(
    offenders,
    [],
    `inline style attribute(s) the CSP will refuse to apply — use a design-layer ` +
      `class, or data-state / data-value:\n${offenders.join("\n")}`,
  );
});

Deno.test("an island method escapes with an esc that is actually in scope", async () => {
  // EnvironmentalSignals.renderSignalCard() called esc() while the only esc in
  // the file was a const inside a *sibling* method, renderSignals(). It threw
  // ReferenceError on the first card, so the neighbours grid rendered every
  // discovered network as nothing at all — an empty environment looked
  // identical to a populated one. The convention is: a method either declares
  // `const esc = …` itself or takes esc as a parameter. This holds the line.
  // A class-method header, not a control-flow head: `if (…) {` / `for (…) {`
  // share the shape, so the keywords are excluded or every method that happens
  // to contain an `if` using esc() would be mis-attributed.
  const KEYWORD = /^(?:if|for|while|switch|catch|return|function|else|do|with|await|typeof|new|throw|case|of|in)$/;
  const methodHead = /\n[ \t]{2,}(?:async[ \t]+)?(?:get[ \t]+|set[ \t]+|\*[ \t]*)?([A-Za-z_$][\w$]*)[ \t]*\(([^)]*)\)[ \t]*\{/g;
  const offenders: string[] = [];

  for (const name of islandFiles()) {
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    // A module-level esc would be visible to every method.
    if (/^(?:export\s+)?(?:const|let|var|function)\s+esc\b/m.test(src)) continue;

    const heads: Array<{ name: string; params: string; headStart: number; bodyStart: number }> = [];
    for (const m of src.matchAll(methodHead)) {
      if (KEYWORD.test(m[1])) continue;
      heads.push({ name: m[1], params: m[2], headStart: m.index!, bodyStart: m.index! + m[0].length });
    }
    for (let i = 0; i < heads.length; i++) {
      const body = src.slice(heads[i].bodyStart, heads[i + 1]?.headStart ?? src.length);
      if (!/\besc\(/.test(body)) continue;
      const declared = /\b(?:const|let|var)\s+esc\b/.test(body);
      const param = /\besc\b/.test(heads[i].params);
      if (!declared && !param) offenders.push(`${name}: ${heads[i].name}()`);
    }
  }

  assertEquals(
    offenders,
    [],
    `island method(s) calling esc() with no esc in scope — a ReferenceError that ` +
      `blanks the whole panel on first render:\n${offenders.join("\n")}`,
  );
});

Deno.test("the neighbours grid links each signal to a served detail route", async () => {
  // The grid is the entry point for per-participant work: every card opens a
  // target profile. If that link or its route goes away, the grid becomes a
  // dead end again.
  const grid = await Deno.readTextFile(`${ISLANDS}/EnvironmentalSignals.js`);
  assert(
    /href=\{?["'`]\/network\/neighbors\//.test(grid) ||
      /["'`]\/network\/neighbors\/\$\{/.test(grid),
    "the signals grid no longer links a card to /network/neighbors/<id>",
  );

  const routes = new Set(
    [...Deno.readDirSync(`${WEB}routes`)].filter((e) => e.isDirectory).map((e) => e.name),
  );
  assert(routes.has("ui--network--neighbors--[id]"), "missing UI route ui--network--neighbors--[id]");
  assert(routes.has("api--network--neighbors--[id]"), "missing API route api--network--neighbors--[id]");
});

Deno.test("the threat map isolates through the CSRF helper and never fabricates location", async () => {
  const src = await Deno.readTextFile(`${ISLANDS}/ThreatMap.js`);

  // The isolate POST must carry the CSRF token. A raw fetch to it omitted
  // X-CT-Token and the route rejected it 403; apiSend attaches the token.
  assert(
    /apiSend\(\s*["'`]\/api\/defense\/isolate/.test(src),
    "isolate should POST via apiSend so the CSRF token is sent",
  );
  assert(
    !/\bfetch\(\s*["'`]\/api\/defense\/isolate/.test(src),
    "isolate must not use a raw fetch — it would 403 with no CSRF token",
  );

  // A threat with no resolved location is tallied, never hashed to one of a
  // table of regions and plotted as if the feed had located it.
  assert(
    !/region\.(lat|lon)\s*\+/.test(src),
    "un-geolocated threats must not be plotted at a fabricated location",
  );
});

Deno.test("the deception page surfaces the canary-token half of the grid", async () => {
  // DeceptionGridService registers credential lures through CanaryService, but
  // the page long showed only the honeypot port decoys, so a tripped lure was
  // invisible. Guard the wiring: the page mounts the island and the route it
  // reads exists.
  const page = await Deno.readTextFile(`${WEB}routes/ui--agents--deception/page.tsx`);
  assert(/<canary-tokens\b/.test(page), "deception page no longer mounts <canary-tokens>");
  assert(
    /["'`]\/components\/islands\/CanaryTokens\.js["'`]/.test(page),
    "deception page no longer loads the CanaryTokens island",
  );

  const routes = new Set(
    [...Deno.readDirSync(`${WEB}routes`)].filter((e) => e.isDirectory).map((e) => e.name),
  );
  assert(routes.has("api--agents--deception--canaries"), "missing API route api--agents--deception--canaries");
});

Deno.test("no island feeds a CSS variable to a canvas colour", async () => {
  // Canvas 2D silently ignores `ctx.strokeStyle = 'var(--warning)'` and keeps
  // its default black, so HoneypotChart drew its whole sparkline black on a
  // near-black panel and the "Trap Engagements" chart looked empty. Canvas
  // needs a concrete colour — resolve the token (e.g. the --*-rgb triplet)
  // through getComputedStyle first.
  const offenders: string[] = [];
  for (const name of islandFiles()) {
    const src = await Deno.readTextFile(`${ISLANDS}/${name}`);
    const patterns = [
      /(?:strokeStyle|fillStyle|shadowColor)\s*=\s*["'`][^"'`]*var\(/g,
      /addColorStop\([^)]*\bvar\(/g,
    ];
    for (const re of patterns) {
      for (const m of src.matchAll(re)) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${name}:${line}  ${m[0].slice(0, 60)}`);
      }
    }
  }
  assertEquals(
    offenders,
    [],
    `canvas colour(s) set to a CSS variable the context cannot resolve — it ` +
      `renders black:\n${offenders.join("\n")}`,
  );
});

Deno.test("the threat map distinguishes estimated locations from precise ones", async () => {
  // Real attribution and a continent-level RIR guess must never look alike. The
  // island reads the server's precision flag, stamps it on each marker, filters
  // on it, and — for an estimate — reports the region rather than inventing a
  // country/city.
  const src = await Deno.readTextFile(`${ISLANDS}/ThreatMap.js`);
  assert(/data-precision/.test(src), "markers must carry a data-precision hint for styling");
  assert(/geo\??\.precision/.test(src), "island must read the server-supplied precision");
  assert(/["'`]estimated["'`]/.test(src), "island must special-case estimated locations");
  // The legend is a live category filter, not a static key.
  assert(/data-cat-toggle/.test(src), "legend categories must be toggleable filters");
  // The estimated popover branch reports the region, never a fabricated country.
  assert(/geo\.region/.test(src), "estimated detail must show the region, not a made-up country");
});

Deno.test("the threat map exposes provenance, search, zoom and bulk isolation safely", async () => {
  const src = await Deno.readTextFile(`${ISLANDS}/ThreatMap.js`);
  // Feed provenance and a source filter, both from the real `provider` field.
  assert(/tm-source/.test(src) && /data-filter=/.test(src), "source breakdown must be a filter");
  assert(/sourceOf\s*\(/.test(src), "island must derive the feed provenance");
  // Search and zoom/pan operator tooling.
  assert(/id="tm-search"/.test(src) && /searchTerm/.test(src), "search box must filter the map");
  assert(/setupZoomPan|applyView/.test(src), "map must support zoom/pan");
  // Bulk isolation must reuse the CSRF-safe helper, never a second raw fetch.
  assert(/bulkIsolateVisible/.test(src), "bulk isolation entry point missing");
  assert(
    (src.match(/apiSend\(\s*["'`]\/api\/defense\/isolate/g) ?? []).length >= 1,
    "isolation (single and bulk) must go through apiSend",
  );
  assert(
    !/\bfetch\(\s*["'`]\/api\/defense\/isolate/.test(src),
    "isolation must never use a raw fetch — it would 403 with no CSRF token",
  );
  // Bulk isolation is a mutation; it must be gated on operator role and confirmed.
  assert(/canOperate/.test(src) && /armed/.test(src), "bulk isolation must be operator-gated and confirmed");
});
