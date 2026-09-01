import { ParasiteEngine } from "./engine/mod.ts";
import { PersistenceScanner } from "./engine/scanners/persistence.ts";
import { ExtensionScanner } from "./engine/scanners/extensions.ts";
import { NetworkScanner } from "./engine/scanners/network.ts";
import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { join, relative, dirname, extname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";

const SUSPICIOUS_EXTENSIONS = [".exe", ".dll", ".sh", ".py", ".ps1", ".js", ".vbs", ".plist", ".service"];

async function collectQuarantine(artifactsDir: string, quarantineDir: string) {
  for await (const entry of walk(artifactsDir, { includeDirs: false })) {
    const ext = extname(entry.path).toLowerCase();
    if (SUSPICIOUS_EXTENSIONS.includes(ext) || entry.path.includes("/persistence/") || entry.path.includes("/browser-extensions/")) {
      const relPath = relative(artifactsDir, entry.path);
      const dest = join(quarantineDir, relPath);
      await Deno.mkdir(dirname(dest), { recursive: true });
      try { await copy(entry.path, dest, { overwrite: true }); } catch {}
    }
  }
}

const artifactsDir = Deno.args[0] || "incident-response/artifacts";
const config = {
  artifactsDir,
  outputPath: "incident-response/analysis/targeted-context.md",
  quarantineDir: "incident-response/analysis/quarantine"
};

const engine = new ParasiteEngine(config);

// Register modular scanners
engine.registerScanner(new PersistenceScanner());
engine.registerScanner(new ExtensionScanner());
engine.registerScanner(new NetworkScanner());

console.log("--- Parasite Detection Engine ---");
const findings = await engine.run();
await engine.generateReport(findings);
await collectQuarantine(config.artifactsDir, config.quarantineDir);

console.log("Analysis Complete.");
