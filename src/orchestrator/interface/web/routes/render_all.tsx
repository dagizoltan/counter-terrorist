/** Renders every UI page with representative props and reports what breaks. */
const R = "/home/user/counter-terrorist/src/orchestrator/interface/web/routes";

// A status object shaped like what the aggregator actually returns.
const status: any = {
  platform: { hostname: "ct-node-01", os: "Ubuntu 24.04", arch: "x86_64", uptime: "3d 4h" },
  audit: { hardwareVerified: true, integrityScore: 100, entries: [], lastVerified: new Date().toISOString() },
  node: { uptime: "3d 4h", cpu: { load: 7, cores: 8 }, memory: { used: 40, total: 100 } },
  threats: { totalIngested: 1288, blocked: 42, feed: [], identified: [] },
  firewall: { active: true, blockedCount: 42, rules: [] },
  mesh: { activeNodes: 3, nodes: [], peers: [] },
  ebpf: { active: true, events: [] },
  fim: { active: true, alerts: [] },
  agents: [], sidecars: [], modules: [], incidents: [], logs: [], notifications: [],
  supplyChain: { packages: [], verified: true },
  network: { interfaces: [], connections: [], neighbors: [] },
  compliance: { score: 96, controls: [] },
  safeMode: false, trippedSidecars: [],
};

const PAGES: Array<[string, string, string, any]> = [
  ["dashboard",            "ui--dashboard",                    "Dashboard",             { status, csrfToken: "t", nonce: "n", hostname: "ct-node-01", userRole: "admin" }],
  ["login",                "ui--login",                        "Login",                 { error: "Invalid token" }],
  ["agents",               "ui--agents",                       "AgentsPage",            { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["agents/deception",     "ui--agents--deception",            "HoneypotsPage",         { modules: [], csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["forensics",            "ui--forensics",                    "ForensicCenterPage",    { csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["compliance",           "ui--forensics--compliance",        "ComplianceCenterPage",  { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["infrastructure",       "ui--infrastructure",               "SysInfoPage",           { status, csrfToken: "t", nonce: "n" }],
  ["infrastructure/mesh",  "ui--infrastructure--mesh",         "MeshTopologyPage",      { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["intel/feed",           "ui--intel--feed",                  "NewsPage",              { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["intel/map",            "ui--intel--map",                   "ThreatMapPage",         { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["network/active",       "ui--network--active",              "ActiveNetworkPage",     { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["network/neighbors",    "ui--network--neighbors",           "NeighborNetworksPage",  { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["system/info",          "ui--system--info",                 "SystemInfoPage",        { status, csrfToken: "t", nonce: "n", hostname: "ct-node-01", userRole: "admin" }],
  ["system/ledger",        "ui--system--ledger",               "AuditPage",             { csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["system/settings",      "ui--system--settings",             "NotificationsPage",     { status, csrfToken: "t", nonce: "n", userRole: "admin" }],
  ["system/supply-chain",  "ui--system--supply-chain",         "SupplyChainPage",       { status, csrfToken: "t", nonce: "n", hostname: "ct-node-01", userRole: "admin" }],
];

// Pages whose export name we could not read statically — discover at runtime.
const EXTRA = ["ui--agents--[name]", "ui--intel--artifact-collections", "ui--intel--public-ip-collections"];

const out: Record<string, string> = {};
let broke = 0;

function inspect(name: string, html: string) {
  const problems: string[] = [];
  if (!html || html.length < 200) problems.push(`suspiciously short (${html.length} chars)`);
  if (html.includes("${")) problems.push("unresolved ${...} template expression");
  if (/>undefined</.test(html) || html.includes('="undefined"')) problems.push("undefined leaked into markup");
  if (html.includes("[object Object]")) problems.push("[object Object] in markup");
  if (/class="[^"]*\bundefined\b/.test(html)) problems.push("undefined in a class attribute");
  if (/<[a-z-]+[^>]*\sclass="\s*"/.test(html)) problems.push("empty class attribute");
  // Attribute emitted outside a tag, the classic sed-rewrite failure.
  if (/>\s*data-(tone|state)=/.test(html)) problems.push("data-* attribute emitted outside a tag");
  return problems;
}

for (const [label, dir, exportName, props] of PAGES) {
  try {
    const mod = await import(`${R}/${dir}/page.tsx`);
    const Comp = mod[exportName] ?? Object.values(mod).find((v) => typeof v === "function");
    if (!Comp) { console.log(`✗ ${label.padEnd(22)} no exported component`); broke++; continue; }
    const html = String((Comp as any)(props));
    out[label] = html;
    const problems = inspect(label, html);
    if (problems.length) { console.log(`✗ ${label.padEnd(22)} ${problems.join("; ")}`); broke++; }
    else console.log(`✓ ${label.padEnd(22)} ${String(html.length).padStart(6)} chars`);
  } catch (e) {
    console.log(`✗ ${label.padEnd(22)} THREW: ${(e as Error).message.split("\n")[0]}`);
    broke++;
  }
}

for (const dir of EXTRA) {
  try {
    const mod = await import(`${R}/${dir}/page.tsx`);
    const names = Object.keys(mod).filter((k) => typeof (mod as any)[k] === "function");
    if (!names.length) { console.log(`✗ ${dir.padEnd(22)} no exported component`); broke++; continue; }
    for (const n of names) {
      try {
        const html = String((mod as any)[n]({ status, modules: [], agent: { name: "sentinel", status: "ONLINE" }, csrfToken: "t", nonce: "n", userRole: "admin" }));
        const problems = inspect(dir, html);
        out[`${dir}:${n}`] = html;
        if (problems.length) { console.log(`✗ ${(dir + ":" + n).padEnd(22)} ${problems.join("; ")}`); broke++; }
        else console.log(`✓ ${(dir + ":" + n).padEnd(22)} ${String(html.length).padStart(6)} chars`);
      } catch (e) { console.log(`✗ ${(dir + ":" + n).padEnd(22)} THREW: ${(e as Error).message.split("\n")[0]}`); broke++; }
    }
  } catch (e) {
    console.log(`✗ ${dir.padEnd(22)} IMPORT FAILED: ${(e as Error).message.split("\n")[0]}`);
    broke++;
  }
}

await Deno.writeTextFile("/tmp/claude-0/-home-user-counter-terrorist/66f74870-65c5-575e-bc32-a93f08bcbb02/scratchpad/rendered.json", JSON.stringify(out));
console.log(`\n${broke === 0 ? "all pages rendered clean" : broke + " page(s) with problems"}`);
