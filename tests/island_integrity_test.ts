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
