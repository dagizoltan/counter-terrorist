import { dirname, join, resolve } from "@std/path";
import { fromFileUrl } from "@std/path/from-file-url";

const scriptDir = dirname(fromFileUrl(import.meta.url));
const manifestPath = resolve(scriptDir, "..", "..", "infrastructure", "runtime", "sidecars.manifest.json");
const repoRoot = resolve(scriptDir, "..", "..", "..", "..");

function normalizeBinaryPath(entryPath: string) {
  const cleaned = entryPath.replace(/^\.\//, "");
  return resolve(repoRoot, cleaned);
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
    if (!entry || typeof entry !== "object" || typeof entry.path !== "string") {
      console.warn(`Skipping malformed manifest entry for '${name}'.`);
      continue;
    }

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
