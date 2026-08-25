/**
 * Production Multi-Platform Release Generator
 * Implements the Unified Artifact Matrix: target/{distro}/{build,deploy,release}
 */
import { copy } from "@std/fs/copy";
import { emptyDir } from "@std/fs/empty-dir";
import { join } from "@std/path";
import { crypto } from "@std/crypto";
import { encodeHex } from "@std/encoding/hex";

const TARGET_ROOT = "./target";
const SRC_ROOT = "./src/orchestrator";
const AGENTS_ROOT = "./src/agents/target/release";
const DEPLOY_TEMPLATES = "./src/deployment";

interface Target {
  id: string;
  platform: string;
  arch: string;
  denoTarget: string;
  ext: string;
  format: "deb" | "zip";
  template: string;
}

const TARGETS: Target[] = [
  { id: "ubuntu_2404", platform: "linux", arch: "x64", denoTarget: "x86_64-unknown-linux-gnu", ext: "", format: "deb", template: "linux" },
  { id: "ubuntu_2606", platform: "linux", arch: "x64", denoTarget: "x86_64-unknown-linux-gnu", ext: "", format: "deb", template: "linux" },
  { id: "win_10", platform: "windows", arch: "x64", denoTarget: "x86_64-pc-windows-msvc", ext: ".exe", format: "zip", template: "windows" },
  { id: "win_11", platform: "windows", arch: "x64", denoTarget: "x86_64-pc-windows-msvc", ext: ".exe", format: "zip", template: "windows" },
  { id: "macos_arm", platform: "darwin", arch: "arm64", denoTarget: "aarch64-apple-darwin", ext: "", format: "zip", template: "macos" },
  { id: "macos_intel", platform: "darwin", arch: "x64", denoTarget: "x86_64-apple-darwin", ext: "", format: "zip", template: "macos" },
];

async function runCommand(cmd: string, args: string[], silent = false) {
  if (!silent) console.log(`[RUN] ${cmd} ${args.join(" ")}`);
  const command = new Deno.Command(cmd, { args });
  const { success, stderr } = await command.output();
  if (!success) {
    const errorMsg = new TextDecoder().decode(stderr);
    if (!silent) console.error(`Command failed: ${cmd} ${args.join(" ")}\n${errorMsg}`);
    if (!cmd.includes("compile") && !cmd.includes("dpkg-deb")) throw new Error("Critical failure");
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

async function calculateHash(path: string): Promise<string> {
  const data = await Deno.readFile(path);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(hashBuffer);
}

async function prepareVendor(webDest: string) {
  const vendorDir = join(webDest, "vendor");
  await Deno.mkdir(vendorDir, { recursive: true });
  const libs = [
    { name: "preact.js", url: "https://esm.sh/preact@10.20.1" },
    { name: "preact-hooks.js", url: "https://esm.sh/preact@10.20.1/hooks" },
    { name: "htm.js", url: "https://esm.sh/htm@3.1.1" }
  ];
  for (const lib of libs) {
    try {
      const res = await fetch(lib.url);
      const code = await res.text();
      const sanitized = code.replace(/from\s*["']https:\/\/esm\.sh\/preact@10\.20\.1["']/g, 'from "./preact.js"');
      await Deno.writeTextFile(join(vendorDir, lib.name), sanitized);
    } catch (e: unknown) {
      console.warn(`[!] Failed to vendor ${lib.name}: ${(e as Error)?.message ?? String(e)}`);
    }
  }
}

async function createDeb(target: Target, buildDir: string, deployDir: string, releaseDir: string) {
  console.log(`[DEB] Packaging ${target.id}...`);
  await emptyDir(deployDir);

  // 1. Structure
  const paths = [
    "usr/bin",
    "usr/lib/counter-terrorist",
    "usr/lib/counter-terrorist/agents",
    "usr/lib/systemd/system",
    "etc/counter-terrorist",
    "var/lib/counter-terrorist",
    "DEBIAN"
  ];
  for (const p of paths) await Deno.mkdir(join(deployDir, p), { recursive: true });

  // 2. Copy Build Artifacts to Deploy Structure
  await copy(join(buildDir, "counter-terrorist"), join(deployDir, "usr/bin/counter-terrorist"));
  await copy(join(buildDir, "agents"), join(deployDir, "usr/lib/counter-terrorist/agents"), { overwrite: true });
  await copy(join(buildDir, "web"), join(deployDir, "usr/lib/counter-terrorist/web"), { overwrite: true });
  
  // 3. Apply Templates
  const templateRoot = join(DEPLOY_TEMPLATES, target.template);
  await copy(join(templateRoot, "debian/DEBIAN/control"), join(deployDir, "DEBIAN/control"), { overwrite: true });
  await copy(join(templateRoot, "debian/DEBIAN/postinst"), join(deployDir, "DEBIAN/postinst"), { overwrite: true });
  
  // Copy all systemd services
  const systemdSrc = join(templateRoot, "systemd");
  for await (const entry of Deno.readDir(systemdSrc)) {
    if (entry.name.endsWith(".service")) {
        await copy(join(systemdSrc, entry.name), join(deployDir, "usr/lib/systemd/system", entry.name), { overwrite: true });
    }
  }

  await Deno.chmod(join(deployDir, "DEBIAN/postinst"), 0o755);

  // 4. Build Final .deb
  const pkgName = `counter-terrorist_${target.id}.deb`;
  await runCommand("dpkg-deb", ["--build", deployDir, join(releaseDir, pkgName)]);
}

async function packageApp() {
  console.log("--- 🌍 Generating Production Unified Artifact Matrix ---");

  // Only empty target root if we can
  try { await emptyDir(TARGET_ROOT); } catch { console.warn("[!] Could not fully empty target/"); }

  for (const target of TARGETS) {
    console.log(`\n📦 [Distro: ${target.id}]`);
    const distroDir = join(TARGET_ROOT, target.id);
    const buildDir = join(distroDir, "build");
    const deployDir = join(distroDir, "deploy");
    const releaseDir = join(distroDir, "release");

    await Deno.mkdir(buildDir, { recursive: true });
    await Deno.mkdir(deployDir, { recursive: true });
    await Deno.mkdir(releaseDir, { recursive: true });

    // 1. Build Phase: Compile Binary
    const binName = `counter-terrorist${target.ext}`;
    try {
      await runCommand("deno", [
        "compile", "--allow-all", "--unstable-kv", "--unstable-net", "--no-check",
        "--target", target.denoTarget,
        "--output", join(buildDir, binName),
        join(SRC_ROOT, "main.ts")
      ]);
    } catch (e) {
      console.warn(`[!] Skipping binary for ${target.id}`);
      continue;
    }

    // 2. Build Phase: Agents
    const agentsDir = join(buildDir, "agents");
    await Deno.mkdir(agentsDir, { recursive: true });
    const agents = ["analyzer", "enforcer", "decoy", "netcap", "watchfile", "trustroot", "tunnel"];
    const manifestPath = join(SRC_ROOT, "infrastructure/runtime/sidecars.manifest.json");
    const manifest = JSON.parse(await Deno.readTextFile(manifestPath));

    for (const agent of agents) {
      const agentBin = `${agent}${target.platform === "windows" ? ".exe" : ""}`;
      const srcPath = join(AGENTS_ROOT, agentBin);
      const destPath = join(agentsDir, agentBin);
      
      try {
        await copy(srcPath, destPath, { overwrite: true });
        // Update manifest hash for the build
        if (target.platform === "linux") {
            const hash = await calculateHash(destPath);
            if (manifest.sidecars[agent]) {
                manifest.sidecars[agent].hash = hash;
            }
        }
      } catch {
        try { 
            await copy(join(AGENTS_ROOT, agent), destPath, { overwrite: true });
            if (target.platform === "linux") {
                const hash = await calculateHash(destPath);
                if (manifest.sidecars[agent]) {
                    manifest.sidecars[agent].hash = hash;
                }
            }
        } catch {}
      }
    }
    
    if (target.platform === "linux") {
        await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));
    }

    // 3. Build Phase: Web
    const webDest = join(buildDir, "web");
    await collectWebAssets(webDest);
    await prepareVendor(webDest);

    // 4. Packaging Phase
    if (target.format === "deb") {
      await createDeb(target, buildDir, deployDir, releaseDir);
    } else {
      const pkgName = `counter-terrorist_${target.id}.zip`;
      
      // For Windows/macOS, copy templates to buildDir before zipping
      if (target.template === "windows") {
        const winTemplate = join(DEPLOY_TEMPLATES, "windows");
        await copy(join(winTemplate, "install.ps1"), join(buildDir, "install.ps1"), { overwrite: true });
      } else if (target.template === "macos") {
        const macosTemplate = join(DEPLOY_TEMPLATES, "macos");
        await copy(join(macosTemplate, "install.sh"), join(buildDir, "install.sh"), { overwrite: true });
        await copy(join(macosTemplate, "com.cts.orchestrator.plist"), join(buildDir, "com.cts.orchestrator.plist"), { overwrite: true });
      }

      const originalCwd = Deno.cwd();
      Deno.chdir(buildDir);
      // Use absolute path for output to avoid issues with chdir
      const absoluteReleasePath = join(originalCwd, releaseDir, pkgName);
      await runCommand("zip", ["-r", absoluteReleasePath, "."], true);
      Deno.chdir(originalCwd);
    }
  }

  console.log(`\n✅ Unified Artifact Matrix ready in ${TARGET_ROOT}/`);
}

if (import.meta.main) {
  packageApp().catch(err => {
    console.error("❌ Packaging failed:", err.message);
    Deno.exit(1);
  });
}
