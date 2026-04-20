import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { relative, join, basename, dirname, extname } from "https://deno.land/std@0.224.0/path/mod.ts";
import { copy } from "https://deno.land/std@0.224.0/fs/copy.ts";

const RED_FLAG_KEYWORDS = [
  /base64/i, /eval\(/i, /exec\(/i, /shell/i, /curl/i, /wget/i, /http/i,
  /powershell/i, /-enc/i, /hidden/i, /bypass/i, /NoProfile/i
];

const HIGH_RISK_PERMISSIONS = [
  "<all_urls>", "webRequest", "webRequestBlocking", "cookies",
  "management", "debugger", "proxy"
];

const SUSPICIOUS_EXTENSIONS = [".exe", ".dll", ".sh", ".py", ".ps1", ".js", ".vbs", ".plist", ".service"];

async function checkRedFlags(text: string): Promise<string[]> {
  return RED_FLAG_KEYWORDS.filter(regex => regex.test(text)).map(regex => regex.source);
}

async function collectSuspiciousFiles(artifactsDir: string, quarantineDir: string) {
  console.log("Starting targeted file quarantine...");
  for await (const entry of walk(artifactsDir, { includeDirs: false })) {
    const ext = extname(entry.path).toLowerCase();

    // Quarantine files with suspicious extensions OR those in 'recent_files.txt' listed paths (future enhancement)
    if (SUSPICIOUS_EXTENSIONS.includes(ext) || entry.path.includes("/persistence/") || entry.path.includes("/browser-extensions/")) {
      const relPath = relative(artifactsDir, entry.path);
      const dest = join(quarantineDir, relPath);
      await Deno.mkdir(dirname(dest), { recursive: true });
      try {
        await copy(entry.path, dest, { overwrite: true });
      } catch (e) {
        // console.error(`Failed to copy ${entry.path}: ${e.message}`);
      }
    }
  }
}

async function generateTriageReport(artifactsDir: string): Promise<string> {
  const report: string[] = ["# Targeted Triage Report (Deno-Powered)\n"];

  // 1. Persistence
  report.push("## Persistence Mechanisms");
  let foundPersistence = false;

  for await (const entry of walk(artifactsDir, {
    match: [/\.plist$/, /\.txt$/, /\.json$/, /\.service$/],
    includeDirs: false
  })) {
    if (entry.path.includes("/persistence/")) {
      foundPersistence = true;
      const relPath = relative(artifactsDir, entry.path);
      try {
        const text = await Deno.readTextFile(entry.path);
        const flags = await checkRedFlags(text);
        const flagHeader = flags.length ? ` [RED FLAGS: {${flags.join(", ")}}]` : "";
        report.push(`### ${relPath}${flagHeader}`);
        report.push("```");
        report.push(text.trim().slice(0, 1500));
        report.push("```");
      } catch (e) {
        report.push(`### ${relPath} (Error reading: ${e.message})`);
      }
    }
  }
  if (!foundPersistence) report.push("No persistence artifacts found.");

  // 2. Browser Extensions
  report.push("\n## Browser Extensions (Manifests)");
  let foundExtensions = false;
  for await (const entry of walk(artifactsDir, { match: [/manifest\.json$/], includeDirs: false })) {
    if (entry.path.includes("/browser-extensions/")) {
      foundExtensions = true;
      try {
        const content = await Deno.readTextFile(entry.path);
        const data = JSON.parse(content);
        const name = data.name || "Unknown";
        const permissions = data.permissions || [];
        const risky = permissions.filter((p: string) => HIGH_RISK_PERMISSIONS.includes(p));
        const riskHeader = risky.length ? ` [RISKY PERMISSIONS: ${risky.join(", ")}]` : "";
        const idFolder = basename(dirname(entry.path));

        report.push(`- **${name}** [ID: {${idFolder}}]${riskHeader}`);
      } catch { }
    }
  }
  if (!foundExtensions) report.push("No browser extension manifests found.");

  // 3. Network
  report.push("\n## External Network Connections");
  for await (const entry of walk(artifactsDir, { match: [/netstat\.txt$/], includeDirs: false })) {
    const hostLabel = basename(dirname(entry.path));
    report.push(`### Host: {${hostLabel}}`);
    try {
      const content = await Deno.readTextFile(entry.path);
      const lines = content.split("\n");
      for (const line of lines) {
        if (line.includes("ESTABLISHED") && !line.includes("127.0.0.1") && !line.includes("::1")) {
          report.push(`- \`${line.strip ? line.strip() : line.trim()}\``);
        }
      }
    } catch (e) { }
  }

  return report.join("\n");
}

const artifactsPath = Deno.args[0] || "incident-response/artifacts";
const quarantinePath = "incident-response/analysis/quarantine";

try {
  const stat = await Deno.stat(artifactsPath);
  if (stat.isDirectory) {
    const reportText = await generateTriageReport(artifactsPath);
    const outputPath = "incident-response/analysis/targeted-context.md";
    await Deno.mkdir(dirname(outputPath), { recursive: true });
    await Deno.writeTextFile(outputPath, reportText);

    await collectSuspiciousFiles(artifactsPath, quarantinePath);

    console.log(`Triage complete.`);
    console.log(`Report: ${outputPath}`);
    console.log(`Quarantine: ${quarantinePath}`);
  }
} catch (e) {
  console.error(`Error: ${e.message}`);
}
