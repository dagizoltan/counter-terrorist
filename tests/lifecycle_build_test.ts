/**
 * Build-orchestration tests.
 *
 * The staleness logic decides whether to skip a 64-second Rust build and, more
 * importantly, whether to refresh the sidecar integrity manifest. Getting that
 * wrong in the "skip" direction produces a node that boots clean and runs no
 * agents, because every binary fails its hash check at spawn. These cover the
 * fingerprint behaviour that decision rests on.
 */
import { assert, assertEquals, assertNotEquals } from "@std/assert";

const LIFECYCLE = new URL("../src/orchestrator/tools/ops/lifecycle.ts", import.meta.url).pathname;

async function tempTree(): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "cts_build_" });
  await Deno.mkdir(`${dir}/src`, { recursive: true });
  await Deno.writeTextFile(`${dir}/src/a.rs`, "fn main() {}");
  await Deno.writeTextFile(`${dir}/src/b.rs`, "fn helper() {}");
  await Deno.writeTextFile(`${dir}/Cargo.toml`, "[package]\nname='x'");
  return dir;
}

/** Mirrors lifecycle.ts's fingerprint(): path + size + mtime over a file set. */
async function fingerprint(root: string, match: (p: string) => boolean): Promise<string> {
  const parts: string[] = [];
  async function walk(dir: string) {
    const entries = [...Deno.readDirSync(dir)].sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) {
        if (e.name === "target" || e.name === ".git" || e.name === "node_modules") continue;
        await walk(p);
      } else if (match(p)) {
        const st = await Deno.stat(p);
        parts.push(`${p}:${st.size}:${st.mtime?.getTime() ?? 0}`);
      }
    }
  }
  await walk(root);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

const rs = (p: string) => p.endsWith(".rs") || p.endsWith("Cargo.toml");

Deno.test("an unchanged tree fingerprints identically", async () => {
  const dir = await tempTree();
  try {
    assertEquals(await fingerprint(dir, rs), await fingerprint(dir, rs));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("editing a source file changes the fingerprint", async () => {
  const dir = await tempTree();
  try {
    const before = await fingerprint(dir, rs);
    await Deno.writeTextFile(`${dir}/src/a.rs`, "fn main() { println!(\"changed\"); }");
    assertNotEquals(await fingerprint(dir, rs), before);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("adding and removing a source file both change the fingerprint", async () => {
  const dir = await tempTree();
  try {
    const before = await fingerprint(dir, rs);
    await Deno.writeTextFile(`${dir}/src/c.rs`, "fn extra() {}");
    const added = await fingerprint(dir, rs);
    assertNotEquals(added, before);

    await Deno.remove(`${dir}/src/c.rs`);
    assertEquals(await fingerprint(dir, rs), before, "removal should restore the prior fingerprint");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("files outside the match set do not trigger a rebuild", async () => {
  const dir = await tempTree();
  try {
    const before = await fingerprint(dir, rs);
    await Deno.writeTextFile(`${dir}/README.md`, "docs are not inputs to the Rust build");
    assertEquals(await fingerprint(dir, rs), before);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("build output is excluded, so a build does not invalidate its own inputs", async () => {
  // Without this the first build would dirty the fingerprint it just recorded,
  // and every subsequent run would rebuild forever.
  const dir = await tempTree();
  try {
    const before = await fingerprint(dir, rs);
    await Deno.mkdir(`${dir}/target/release`, { recursive: true });
    await Deno.writeTextFile(`${dir}/target/release/build.rs`, "// emitted by the build");
    assertEquals(await fingerprint(dir, rs), before);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("the build tools carry no third-party imports", async () => {
  // These run during bootstrap, when the module cache may be cold and an
  // air-gapped host has no network to populate it from. A jsr:/npm: import
  // here makes a first build on such a host impossible.
  for (const rel of [
    "../src/orchestrator/tools/ops/lifecycle.ts",
    "../src/orchestrator/tools/build/build_css.ts",
    "../src/orchestrator/tools/build/update_sidecar_manifest.ts",
  ]) {
    const src = await Deno.readTextFile(new URL(rel, import.meta.url).pathname);
    const imports = [...src.matchAll(/^\s*import\s.*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    const external = imports.filter((i) => !i.startsWith(".") && !i.startsWith("node:"));
    assertEquals(external, [], `${rel} must stay dependency-free, found: ${external.join(", ")}`);
  }
});

Deno.test("the launcher does not widen the orchestrator's sandbox", async () => {
  // The launcher needs --allow-run to invoke cargo. The node it spawns must
  // still get the same narrow permission set as `deno task start`.
  const src = await Deno.readTextFile(LIFECYCLE);
  const block = src.match(/const ORCHESTRATOR_PERMS = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert(block.length > 0, "ORCHESTRATOR_PERMS not found");
  assert(!block.includes("--allow-all"), "orchestrator must never be spawned with --allow-all");

  const denoJson = JSON.parse(
    await Deno.readTextFile(new URL("../deno.json", import.meta.url).pathname),
  );
  for (const flag of ["--allow-net", "--allow-ffi", "--unstable-kv"]) {
    assert(block.includes(flag), `ORCHESTRATOR_PERMS is missing ${flag}`);
    assert(denoJson.tasks.start.includes(flag), `the start task is missing ${flag}`);
  }
  // The write scope is the one most likely to drift apart between the two.
  assert(
    block.includes('--allow-write=./,/var/lib/cts,/tmp') &&
      denoJson.tasks.start.includes("--allow-write=./,/var/lib/cts,/tmp"),
    "launcher and start task disagree on the write scope",
  );
});
