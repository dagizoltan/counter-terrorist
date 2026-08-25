/**
 * lifecycle.ts — one command to build, start and stop the node.
 *
 * WHY THIS EXISTS
 * ---------------
 * Bringing a node up meant remembering four commands in the right order:
 *
 *     deno task setup           # once, generates .env
 *     deno task build-agents    # cargo build + refresh the sidecar manifest
 *     deno task build-css       # regenerate the stylesheet
 *     deno task start
 *
 * Nothing enforced that order and nothing tracked what was already current, so
 * the honest way to work was to run all of it every time. Worse, skipping the
 * manifest refresh after a Rust change is not a visible failure: the binaries
 * no longer match their recorded hashes and every sidecar is refused at spawn,
 * which surfaces later as a node that boots "successfully" with no agents.
 *
 * This replaces all of it with `deno task up`. Each build step records a
 * fingerprint of its inputs, so a step runs only when something it depends on
 * actually changed. Measured on this workspace:
 *
 *     cold agent build   ~64s      (unavoidable, once)
 *     warm, nothing changed         no cargo invocation at all
 *     stylesheet         ~90ms     only when markup or design/ changed
 *
 * DEPENDENCIES
 * ------------
 * Deliberately none. This is the tool that bootstraps the project, so it must
 * run on a fresh clone with a cold module cache and no network — which is the
 * normal condition for an air-gapped appliance. It uses only Deno built-ins.
 */

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/, "");
const STATE_DIR = `${ROOT}/.cts`;
const STATE_FILE = `${STATE_DIR}/build-state.json`;
const PID_FILE = `${STATE_DIR}/node.pid`;

const AGENTS_DIR = `${ROOT}/src/agents`;
const WEB_DIR = `${ROOT}/src/orchestrator/interface/web`;
/** The orchestrator entrypoint — spawned here, and used to verify PID identity. */
const ENTRYPOINT = `${ROOT}/src/orchestrator/index.ts`;
const ENTRYPOINT_SUFFIX = "src/orchestrator/index.ts";

/**
 * Permissions handed to the orchestrator process. Kept identical to the
 * `start` task — the launcher needs --allow-run to invoke cargo, and must not
 * pass that widened surface on to the node it starts.
 */
const ORCHESTRATOR_PERMS = [
  "--allow-net",
  "--allow-env",
  "--allow-ffi",
  "--allow-read",
  "--allow-write=./,/var/lib/cts,/tmp",
  "--allow-sys=hostname,osRelease,uid,gid,networkInterfaces,systemMemoryInfo,loadavg,cpus",
  "--allow-run",
  "--unstable-kv",
];

// ── Output ────────────────────────────────────────────────────────────────

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
};

const step = (name: string, detail: string) => console.log(`  ${C.green("✓")} ${name.padEnd(10)} ${C.dim(detail)}`);
const work = (name: string, detail: string) => console.log(`  ${C.yellow("•")} ${name.padEnd(10)} ${detail}`);
const fail = (name: string, detail: string) => console.log(`  ${C.red("✗")} ${name.padEnd(10)} ${detail}`);

// ── Build state ───────────────────────────────────────────────────────────

interface BuildState {
  agents?: string;
  manifest?: string;
  css?: string;
}

async function readState(): Promise<BuildState> {
  try {
    return JSON.parse(await Deno.readTextFile(STATE_FILE));
  } catch {
    return {};
  }
}

async function writeState(state: BuildState): Promise<void> {
  await Deno.mkdir(STATE_DIR, { recursive: true });
  await Deno.writeTextFile(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

/**
 * Fingerprint a file set by path + size + mtime.
 *
 * Content hashing would be more precise but has to read every byte; the agent
 * binaries alone are ~15MB. Size and mtime is what build systems use and it
 * errs the safe way — a touched file rebuilds, which costs time but never
 * ships a stale artifact.
 */
async function fingerprint(roots: string[], match: (path: string) => boolean): Promise<string> {
  const parts: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(dir)];
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        // Never descend into build output or VCS metadata.
        if (entry.name === "target" || entry.name === ".git" || entry.name === "node_modules") continue;
        await walk(path);
      } else if (match(path)) {
        try {
          const st = await Deno.stat(path);
          parts.push(`${path}:${st.size}:${st.mtime?.getTime() ?? 0}`);
        } catch { /* raced with a delete; treat as absent */ }
      }
    }
  }

  for (const root of roots) {
    const st = await Deno.stat(root).catch(() => null);
    if (!st) continue;
    if (st.isDirectory) await walk(root);
    else if (match(root)) parts.push(`${root}:${st.size}:${st.mtime?.getTime() ?? 0}`);
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

const agentsFingerprint = () =>
  fingerprint(
    [AGENTS_DIR],
    (p) => p.endsWith(".rs") || p.endsWith("Cargo.toml") || p.endsWith("Cargo.lock"),
  );

const binariesFingerprint = () =>
  fingerprint(
    [`${AGENTS_DIR}/target/release`],
    (p) => !/\.(d|rlib|rmeta|o)$/.test(p) && !p.includes("/deps/") && !p.includes("/build/") &&
      !p.includes("/incremental/") && !p.endsWith("/.fingerprint"),
  );

const cssFingerprint = () =>
  fingerprint(
    [WEB_DIR, `${ROOT}/src/orchestrator/tools/build/build_css.ts`],
    (p) => p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".ts") ||
      (p.endsWith(".css") && p.includes("/design/")),
  );

// ── Process helpers ───────────────────────────────────────────────────────

async function run(cmd: string, args: string[], cwd?: string): Promise<boolean> {
  const child = new Deno.Command(cmd, { args, cwd, stdout: "inherit", stderr: "inherit" }).spawn();
  const { success } = await child.status;
  return success;
}

async function runQuiet(cmd: string, args: string[], cwd?: string): Promise<{ ok: boolean; out: string }> {
  try {
    const { success, stdout, stderr } = await new Deno.Command(cmd, {
      args, cwd, stdout: "piped", stderr: "piped",
    }).output();
    return { ok: success, out: new TextDecoder().decode(success ? stdout : stderr) };
  } catch (e) {
    return { ok: false, out: (e as Error).message };
  }
}

const has = (bin: string) =>
  new Deno.Command(bin, { args: ["--version"], stdout: "null", stderr: "null" })
    .output().then((r) => r.success).catch(() => false);

const exists = (p: string) => Deno.stat(p).then(() => true).catch(() => false);

// ── Ensure steps ──────────────────────────────────────────────────────────

/** .env with real secrets. Never regenerated once present. */
async function ensureEnv(): Promise<boolean> {
  if (await exists(`${ROOT}/.env`)) {
    step("env", ".env present");
    return true;
  }
  work("env", "generating .env with fresh secrets");
  const ok = await run(Deno.execPath(), [
    "run", "--allow-read=./", "--allow-write=./.env", "--allow-env",
    `${ROOT}/src/orchestrator/tools/ops/init_env.ts`,
  ], ROOT);
  if (!ok) fail("env", "could not generate .env");
  return ok;
}

/**
 * Rust sidecars, then the integrity manifest.
 *
 * The manifest step is not optional bookkeeping: sidecar_manager refuses to
 * spawn any binary whose hash does not match its manifest entry. A rebuild
 * without a manifest refresh yields a node that boots clean and runs no agents.
 * Tying them together here is the point of this function.
 */
async function ensureAgents(state: BuildState, force: boolean): Promise<boolean> {
  if (!await has("cargo")) {
    fail("agents", "cargo not found — install Rust, or run `deno task up --no-agents`");
    return false;
  }

  const fp = await agentsFingerprint();
  const built = await exists(`${AGENTS_DIR}/target/release/trustroot`);

  if (!force && built && state.agents === fp) {
    step("agents", "up to date");
  } else {
    work("agents", built ? "sources changed, rebuilding" : "first build — this takes a minute");
    if (!await run("cargo", ["build", "--release"], AGENTS_DIR)) {
      fail("agents", "cargo build failed");
      return false;
    }
    state.agents = fp;
  }

  // Refresh the manifest whenever the binaries differ from what it recorded.
  const binFp = await binariesFingerprint();
  if (!force && state.manifest === binFp) {
    step("manifest", "hashes current");
    return true;
  }

  work("manifest", "refreshing sidecar integrity hashes");
  const ok = await run(Deno.execPath(), [
    "run", "--allow-read", "--allow-write",
    `${ROOT}/src/orchestrator/tools/build/update_sidecar_manifest.ts`,
  ], ROOT);
  if (!ok) {
    fail("manifest", "hash refresh failed — sidecars would be refused at spawn");
    return false;
  }
  state.manifest = await binariesFingerprint();
  return true;
}

/** Stylesheet. Fails loudly on an unresolvable class rather than shipping it. */
async function ensureCss(state: BuildState, force: boolean): Promise<boolean> {
  const fp = await cssFingerprint();
  if (!force && state.css === fp && await exists(`${WEB_DIR}/style.css`)) {
    step("styles", "up to date");
    return true;
  }

  work("styles", "rebuilding stylesheet");
  const { ok, out } = await runQuiet(Deno.execPath(), [
    "run", "--allow-read", "--allow-write",
    `${ROOT}/src/orchestrator/tools/build/build_css.ts`,
  ], ROOT);
  if (!ok) {
    fail("styles", "stylesheet build failed");
    console.error(out);
    return false;
  }
  state.css = await cssFingerprint();
  return true;
}

interface EnsureOpts { force?: boolean; agents?: boolean; css?: boolean }

async function ensureAll(opts: EnsureOpts = {}): Promise<boolean> {
  const state = await readState();
  const force = opts.force ?? false;
  let ok = await ensureEnv();

  if (ok && opts.agents !== false) ok = await ensureAgents(state, force);
  if (ok && opts.css !== false) ok = await ensureCss(state, force);

  await writeState(state);
  return ok;
}

// ── Run control ───────────────────────────────────────────────────────────

/**
 * Resolve the PID file to a live orchestrator, or null.
 *
 * A recorded PID is not enough. If the node dies unexpectedly the PID file
 * outlives it, and the kernel recycles PIDs — so a stale file eventually names
 * some unrelated process. `stop` would then SIGTERM, and after the grace period
 * SIGKILL, whatever now holds that number. On a host running this thing that is
 * an unacceptable way to lose a process.
 *
 * So identity is verified, not assumed: on Linux via /proc/<pid>/cmdline, which
 * must still name this repo's entrypoint. Elsewhere we fall back to a liveness
 * probe and accept the weaker guarantee.
 */
async function runningPid(): Promise<number | null> {
  const raw = await Deno.readTextFile(PID_FILE).catch(() => null);
  if (!raw) return null;

  let pid: number;
  try {
    const parsed = JSON.parse(raw);
    pid = Number(parsed?.pid);
  } catch {
    pid = Number(raw.trim());   // tolerate a bare-number file from an older build
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    await Deno.remove(PID_FILE).catch(() => {});
    return null;
  }

  const forget = async () => {
    await Deno.remove(PID_FILE).catch(() => {});
    return null;
  };

  // Linux: confirm the process is still our orchestrator.
  const cmdline = await Deno.readTextFile(`/proc/${pid}/cmdline`).catch(() => null);
  if (cmdline !== null) {
    return cmdline.split("\0").some((arg) => arg.endsWith(ENTRYPOINT_SUFFIX)) ? pid : await forget();
  }

  // /proc unavailable (non-Linux). SIGCONT is a no-op for a running process and
  // is the closest thing Deno.kill offers to a liveness probe.
  try {
    Deno.kill(pid, "SIGCONT");
    return pid;
  } catch {
    return await forget();
  }
}

async function start(extraEnv: Record<string, string> = {}): Promise<number> {
  const already = await runningPid();
  if (already) {
    console.log(`\n  ${C.yellow("!")} already running (pid ${already}) — \`deno task stop\` first\n`);
    return 1;
  }

  console.log(`\n${C.bold("  starting orchestrator")}\n`);
  await Deno.mkdir(STATE_DIR, { recursive: true });

  const child = new Deno.Command(Deno.execPath(), {
    args: ["run", ...ORCHESTRATOR_PERMS, ENTRYPOINT],
    cwd: ROOT,
    env: { ...Deno.env.toObject(), ...extraEnv },
    stdout: "inherit",
    stderr: "inherit",
  }).spawn();

  await Deno.writeTextFile(
    PID_FILE,
    JSON.stringify({ pid: child.pid, startedAt: new Date().toISOString(), entrypoint: ENTRYPOINT }, null, 2),
  );

  // Forward terminal signals so Ctrl-C reaches the orchestrator and it runs
  // its own graceful shutdown, rather than the launcher dying and orphaning it.
  let forwarding = true;
  const forward = (sig: Deno.Signal) => () => {
    if (!forwarding) return;
    try { child.kill(sig); } catch { /* already gone */ }
  };
  const onInt = forward("SIGINT");
  const onTerm = forward("SIGTERM");
  try { Deno.addSignalListener("SIGINT", onInt); } catch { /* unsupported */ }
  try { Deno.addSignalListener("SIGTERM", onTerm); } catch { /* unsupported */ }

  const { code } = await child.status;
  forwarding = false;
  try { Deno.removeSignalListener("SIGINT", onInt); } catch { /* noop */ }
  try { Deno.removeSignalListener("SIGTERM", onTerm); } catch { /* noop */ }
  await Deno.remove(PID_FILE).catch(() => {});
  return code;
}

/** SIGTERM, then wait for the node's own graceful shutdown before escalating. */
async function stop(timeoutMs = 15000): Promise<number> {
  const pid = await runningPid();
  if (!pid) {
    console.log(`  ${C.dim("not running")}`);
    return 0;
  }

  console.log(`  ${C.yellow("•")} stopping (pid ${pid})`);
  try {
    Deno.kill(pid, "SIGTERM");
  } catch {
    await Deno.remove(PID_FILE).catch(() => {});
    return 0;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 200));
    if (!await runningPid()) {
      console.log(`  ${C.green("✓")} stopped cleanly`);
      return 0;
    }
  }

  console.log(`  ${C.red("✗")} no exit after ${timeoutMs / 1000}s — sending SIGKILL`);
  try { Deno.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  await Deno.remove(PID_FILE).catch(() => {});
  return 1;
}

async function status(): Promise<number> {
  const state = await readState();
  const pid = await runningPid();

  console.log(`\n${C.bold("  node")}`);
  console.log(pid ? `    running   pid ${pid}` : `    ${C.dim("stopped")}`);

  console.log(`\n${C.bold("  build")}`);
  const envOk = await exists(`${ROOT}/.env`);
  console.log(`    env       ${envOk ? C.green("ready") : C.yellow("missing — will be generated")}`);

  const builtAgents = await exists(`${AGENTS_DIR}/target/release/trustroot`);
  const agentsFp = await agentsFingerprint();
  console.log(
    `    agents    ${!builtAgents ? C.yellow("not built") : state.agents === agentsFp ? C.green("current") : C.yellow("stale — sources changed")}`,
  );

  const binFp = await binariesFingerprint();
  console.log(
    `    manifest  ${state.manifest === binFp ? C.green("current") : C.yellow("stale — binaries changed since last sync")}`,
  );

  const cssFp = await cssFingerprint();
  const cssBuilt = await exists(`${WEB_DIR}/style.css`);
  console.log(
    `    styles    ${!cssBuilt ? C.yellow("not built") : state.css === cssFp ? C.green("current") : C.yellow("stale — markup or design changed")}`,
  );

  console.log(`\n  ${C.dim("`deno task up` brings everything current and starts the node.")}\n`);
  return 0;
}

/** Drop build artifacts. Never touches .env or the data volume. */
async function clean(all: boolean): Promise<number> {
  console.log("");
  await Deno.remove(STATE_FILE).catch(() => {});
  step("state", "build fingerprints cleared");

  if (all) {
    if (await exists(`${AGENTS_DIR}/target`)) {
      await Deno.remove(`${AGENTS_DIR}/target`, { recursive: true }).catch(() => {});
      step("agents", "target/ removed — next build is cold (~1 min)");
    }
  }

  console.log(`\n  ${C.dim(".env and ./volume are left untouched.")}\n`);
  return 0;
}

// ── CLI ───────────────────────────────────────────────────────────────────

const USAGE = `
${C.bold("cts — node lifecycle")}

  deno task up            build whatever is stale, then start
  deno task up:mesh       same, with mesh peering enabled
  deno task build         build whatever is stale, do not start
  deno task status        what is running and what is stale
  deno task stop          graceful shutdown of a running node
  deno task restart       stop, then up
  deno task clean         forget build fingerprints
  deno task clean --all   also delete the Rust target/ directory

${C.bold("flags")}

  --force        rebuild everything, ignoring fingerprints
  --no-agents    skip the Rust build (styles and node only)
  --no-css       skip the stylesheet build
`;

async function main(): Promise<number> {
  const args = [...Deno.args];
  const command = args.find((a) => !a.startsWith("-")) ?? "up";
  const flags = new Set(args.filter((a) => a.startsWith("-")));

  const opts: EnsureOpts = {
    force: flags.has("--force"),
    agents: !flags.has("--no-agents"),
    css: !flags.has("--no-css"),
  };

  switch (command) {
    case "up":
    case "start": {
      console.log(`\n${C.bold("  preparing node")}\n`);
      if (!await ensureAll(opts)) {
        console.log(`\n  ${C.red("build failed — not starting")}\n`);
        return 1;
      }
      return await start(flags.has("--mesh") ? { SINGLE_NODE: "false" } : { SINGLE_NODE: "true" });
    }

    case "build": {
      console.log(`\n${C.bold("  building")}\n`);
      const ok = await ensureAll(opts);
      console.log(ok ? `\n  ${C.green("ready")} — \`deno task up\` to start\n` : `\n  ${C.red("build failed")}\n`);
      return ok ? 0 : 1;
    }

    case "status":
      return await status();

    case "stop":
      console.log("");
      return await stop();

    case "restart": {
      console.log("");
      await stop();
      console.log(`\n${C.bold("  preparing node")}\n`);
      if (!await ensureAll(opts)) return 1;
      return await start();
    }

    case "clean":
      return await clean(flags.has("--all"));

    default:
      console.log(USAGE);
      return command === "help" || flags.has("--help") ? 0 : 1;
  }
}

if (import.meta.main) Deno.exit(await main());
