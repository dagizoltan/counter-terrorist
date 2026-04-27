/**
 * Packaging script for Counter-Terrorist Security Orchestrator.
 * Collects binaries, source files, and configuration templates into a dist/ directory.
 */
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { emptyDir } from "https://deno.land/std@0.224.0/fs/empty_dir.ts";

const DIST_DIR = "./dist";

async function package() {
  console.log("--- Starting Packaging Process ---");

  // 1. Clean dist directory
  await emptyDir(DIST_DIR);
  console.log(`[1/5] Cleaned ${DIST_DIR}`);

  // 2. Build Rust agents
  console.log("[2/5] Building Rust agents (release)...");
  const buildCmd = new Deno.Command("cargo", {
    args: ["build", "--release"],
    cwd: "./agents"
  });
  const { success, stderr } = await buildCmd.output();
  if (!success) {
    console.error("Cargo build failed!");
    console.error(new TextDecoder().decode(stderr));
    Deno.exit(1);
  }

  // 3. Copy binaries
  await Deno.mkdir(`${DIST_DIR}/bin`, { recursive: true });
  await Deno.copyFile("./agents/target/release/scanner", `${DIST_DIR}/bin/scanner`);
  await Deno.copyFile("./agents/target/release/blocker", `${DIST_DIR}/bin/blocker`);
  console.log("[3/5] Binaries copied to dist/bin");

  // 4. Copy Orchestrator source and web assets
  await copy("./orchestrator", `${DIST_DIR}/orchestrator`, { overwrite: true });
  await Deno.copyFile("./deno.json", `${DIST_DIR}/deno.json`);
  console.log("[4/5] Orchestrator source and assets copied");

  // 5. Copy deployment templates
  await copy("./deployment", `${DIST_DIR}/deployment`, { overwrite: true });
  console.log("[5/5] Deployment templates copied");

  console.log("\n--- Packaging Complete ---");
  console.log(`Output: ${DIST_DIR}`);
}

if (import.meta.main) {
  await package();
}
