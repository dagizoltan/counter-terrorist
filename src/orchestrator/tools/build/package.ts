/**
 * Production Multi-Platform Packaging Script
 * Generates structured releases for Linux, Windows, and macOS.
 */
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";
import { emptyDir } from "https://deno.land/std@0.224.0/fs/empty_dir.ts";
import { join } from "https://deno.land/std@0.224.0/path/mod.ts";

const RELEASE_ROOT = "./release";
const SRC_ROOT = "./src/orchestrator";
const AGENTS_ROOT = "./src/agents/target/release";

interface Target {
  id: string;
  platform: string;
  arch: string;
  denoTarget: string;
  ext: string;
}

const TARGETS: Target[] = [
  { id: "ubuntu_2404", platform: "linux", arch: "x64", denoTarget: "x86_64-unknown-linux-gnu", ext: "" },
  { id: "ubuntu_2606", platform: "linux", arch: "x64", denoTarget: "x86_64-unknown-linux-gnu", ext: "" },
  { id: "win_10", platform: "windows", arch: "x64", denoTarget: "x86_64-pc-windows-msvc", ext: ".exe" },
  { id: "win_11", platform: "windows", arch: "x64", denoTarget: "x86_64-pc-windows-msvc", ext: ".exe" },
  { id: "macos_arm", platform: "darwin", arch: "arm64", denoTarget: "aarch64-apple-darwin", ext: "" },
  { id: "macos_intel", platform: "darwin", arch: "x64", denoTarget: "x86_64-apple-darwin", ext: "" },
];

async function runCommand(cmd: string, args: string[]) {
  console.log(`[RUN] ${cmd} ${args.join(" ")}`);
  const command = new Deno.Command(cmd, { args });
  const { success, stderr } = await command.output();
  if (!success) {
    const errorMsg = new TextDecoder().decode(stderr);
    console.error(`Command failed: ${cmd} ${args.join(" ")}\n${errorMsg}`);
    // Don't throw for cross-compile errors if tools are missing, just warn
    if (!cmd.includes("compile")) throw new Error("Critical build failure");
  }
}

async function collectWebAssets(dest: string) {
  const webSrc = join(SRC_ROOT, "interface/web");
  
  const walk = async (src: string, currentDest: string) => {
    for await (const entry of Deno.readDir(src)) {
      const srcPath = join(src, entry.name);
      const destPath = join(currentDest, entry.name);

      if (entry.isDirectory) {
        await walk(srcPath, destPath);
      } else if (/\.(css|js|png|jpg|jpeg|svg|json|ico|html)$/.test(entry.name)) {
        await Deno.mkdir(currentDest, { recursive: true });
        await copy(srcPath, destPath, { overwrite: true });
      }
    }
  };

  await walk(webSrc, dest);
}

async function prepareVendor(webDest: string) {
  const vendorDir = join(webDest, "vendor");
  await Deno.mkdir(vendorDir, { recursive: true });

  console.log("[VENDOR] Downloading local runtime fallbacks...");
  const libs = [
    { name: "preact.js", url: "https://esm.sh/preact@10.20.1" },
    { name: "preact-hooks.js", url: "https://esm.sh/preact@10.20.1/hooks" },
    { name: "htm.js", url: "https://esm.sh/htm@3.1.1" }
  ];

  for (const lib of libs) {
    try {
      const res = await fetch(lib.url);
      const code = await res.text();
      // Simple transform to make it work locally
      const sanitized = code.replace(/from\s*["']https:\/\/esm\.sh\/preact@10\.20\.1["']/g, 'from "./preact.js"');
      await Deno.writeTextFile(join(vendorDir, lib.name), sanitized);
    } catch (e) {
      console.warn(`[!] Failed to vendor ${lib.name}: ${e.message}`);
    }
  }
}

async function packageApp() {
  console.log("--- 🌍 Building Multi-Platform Release Matrix ---");

  await emptyDir(RELEASE_ROOT);

  for (const target of TARGETS) {
    console.log(`\n📦 [Target: ${target.id}]`);
    const targetDir = join(RELEASE_ROOT, target.id);
    await Deno.mkdir(targetDir, { recursive: true });

    // 1. Compile Binary
    const binName = `counter-terrorist${target.ext}`;
    try {
      await runCommand("deno", [
        "compile",
        "--allow-all",
        "--unstable-kv",
        "--unstable-net",
        "--no-check",
        "--target", target.denoTarget,
        "--output", join(targetDir, binName),
        join(SRC_ROOT, "main.ts")
      ]);
    } catch (e) {
      console.warn(`[!] Skipping binary for ${target.id} (Tools missing or incompatible)`);
    }

    // 2. Collect Agents (Platform specific)
    const agentsDir = join(targetDir, "agents");
    await Deno.mkdir(agentsDir, { recursive: true });
    
    // For now we copy existing binaries, in real CI we'd pull platform-specific ones
    const agents = ["scanner", "blocker", "honeypot", "pcap", "fim"];
    for (const agent of agents) {
      const agentBin = `${agent}${target.platform === "windows" ? ".exe" : ""}`;
      try {
        await copy(join(AGENTS_ROOT, agentBin), join(agentsDir, agentBin), { overwrite: true });
      } catch {
        // Fallback to generic if platform-specific missing
        try { await copy(join(AGENTS_ROOT, agent), join(agentsDir, agentBin), { overwrite: true }); } catch {}
      }
    }

    // 3. Web Assets & Vendor
    const webDest = join(targetDir, "web");
    await collectWebAssets(webDest);
    await prepareVendor(webDest);

    // 4. Config & Data
    await Deno.mkdir(join(targetDir, "data"), { recursive: true });
    await Deno.writeTextFile(join(targetDir, ".env.example"), 
      "PORT=8000\nAPI_TOKEN=gen_your_secure_token\nMESH_SECRET=gen_your_mesh_secret\n"
    );
  }

  console.log(`\n✅ Release Matrix ready in ${RELEASE_ROOT}/`);
}

if (import.meta.main) {
  packageApp().catch(err => {
    console.error("❌ Packaging failed:", err.message);
    Deno.exit(1);
  });
}
