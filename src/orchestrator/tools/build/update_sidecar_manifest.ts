/**
 * update_sidecar_manifest — records the SHA-256 of every sidecar binary.
 *
 * sidecar_manager refuses to spawn a binary whose hash does not match its
 * manifest entry, so this must run after any Rust rebuild. `deno task up`
 * chains the two automatically; see tools/ops/lifecycle.ts.
 *
 * Deliberately dependency-free. This runs during bootstrap, when the module
 * cache may be cold and — on the air-gapped appliances this project targets —
 * there is no network to populate it from. It previously imported @std/path,
 * which made a first build on such a host impossible.
 */

const here = new URL(import.meta.url);
const manifestPath = new URL("../../infrastructure/runtime/sidecars.manifest.json", here).pathname;
const repoRoot = new URL("../../../../", here).pathname.replace(/\/$/, "");

function normalizeBinaryPath(entryPath: string) {
  const cleaned = entryPath.replace(/^\.\//, "");
  return cleaned.startsWith("/") ? cleaned : `${repoRoot}/${cleaned}`;
}

async function sha256File(filePath: string): Promise<string> {
  const bytes = await Deno.readFile(filePath);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function main() {
  console.log("🔧 Updating sidecar manifest hashes...");

  const manifestText = await Deno.readTextFile(manifestPath);
  const manifest = JSON.parse(manifestText) as Record<string, unknown>;
  if (!manifest.sidecars || typeof manifest.sidecars !== "object") {
    throw new Error("Invalid sidecars.manifest.json structure: missing 'sidecars' object.");
  }

  let updated = false;
  for (const [name, entry] of Object.entries(manifest.sidecars as Record<string, any>)) {
    if (!entry || typeof entry !== "object") {
      console.warn(`Skipping malformed manifest entry for '${name}'.`);
      continue;
    }

    if (entry.architectures && typeof entry.architectures === "object") {
      for (const [arch, archEntry] of Object.entries(entry.architectures as Record<string, any>)) {
        if (!archEntry || typeof archEntry.path !== "string") continue;
        const binaryPath = normalizeBinaryPath(archEntry.path);
        try {
          const currentHash = await sha256File(binaryPath);
          if (archEntry.hash !== currentHash) {
            console.log(`- ${name} (${arch}): hash updated (${archEntry.hash?.slice(0, 8) || "none"} -> ${currentHash.slice(0, 8)})`);
            archEntry.hash = currentHash;
            updated = true;
          } else {
            console.log(`- ${name} (${arch}): hash unchanged`);
          }
        } catch (error) {
          console.warn(`- ${name} (${arch}): unable to hash '${binaryPath}' (${(error as Error).message})`);
        }
      }
    } else if (typeof entry.path === "string") {
      const binaryPath = normalizeBinaryPath(entry.path);
      try {
        const currentHash = await sha256File(binaryPath);
        if (entry.hash !== currentHash) {
          console.log(`- ${name}: hash updated (${entry.hash?.slice(0, 8) || "none"} -> ${currentHash.slice(0, 8)})`);
          entry.hash = currentHash;
          updated = true;
        } else {
          console.log(`- ${name}: hash unchanged`);
        }
      } catch (error) {
        console.warn(`- ${name}: unable to hash '${binaryPath}' (${(error as Error).message})`);
      }
    } else {
      console.warn(`Skipping malformed manifest entry for '${name}'.`);
    }
  }

  if (updated) {
    await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`✅ Updated ${manifestPath}`);
  } else {
    console.log("✅ No manifest changes needed.");
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Failed to update sidecar manifest:", error.message);
    Deno.exit(1);
  });
}
