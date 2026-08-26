import { assert, assertEquals } from "@std/assert";

const WEB = new URL("../src/orchestrator/interface/web/", import.meta.url).pathname;

function routePaths(prefix: "ui" | "api"): string[] {
  return [...Deno.readDirSync(`${WEB}routes`)]
    .filter((e) => e.isDirectory && e.name.startsWith(`${prefix}--`))
    .map((e) => {
      const raw = e.name.replace(/^(ui|api)--/, "");
      const segs = raw.split("--").map((s) => (s.startsWith("[") && s.endsWith("]")) ? `:${s.slice(1, -1)}` : s);
      return `/${segs.join("/")}`;
    });
}

/** A nav href resolves if some route matches it segment-for-segment, a `:param`
 *  route segment matching any concrete value. */
function isServed(href: string, routes: string[]): boolean {
  const hs = href.replace(/\/+$/, "").split("/");
  return routes.some((r) => {
    const rs = r.split("/");
    if (rs.length !== hs.length) return false;
    return rs.every((seg, i) => seg === hs[i] || seg.startsWith(":"));
  });
}

Deno.test("every sidebar link points at a route the server serves", async () => {
  // The regression: the "Compliance Center" link pointed at /compliance, which
  // no route serves — the real page is /forensics/compliance — so it 404'd. The
  // sidebar is hand-written and nothing tied it to the route set; this does.
  const nav = await Deno.readTextFile(`${WEB}components/SidebarNav.tsx`);
  const hrefs = [...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
    .filter((h) => h.startsWith("/"));            // ignore any external/mailto
  assert(hrefs.length > 0, "no sidebar hrefs found");

  const routes = [...routePaths("ui"), "/login", "/logout"];
  const dead = hrefs.filter((h) => !isServed(h, routes));
  assertEquals(dead, [], `sidebar link(s) with no matching route:\n${dead.join("\n")}`);
});
