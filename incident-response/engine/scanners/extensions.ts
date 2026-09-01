import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { dirname, basename } from "https://deno.land/std@0.224.0/path/mod.ts";
import { Scanner, Finding } from "../types.ts";

const HIGH_RISK_PERMISSIONS = ["<all_urls>", "webRequest", "cookies", "proxy", "debugger"];

export class ExtensionScanner implements Scanner {
  name = "ExtensionScanner";

  async scan(artifactsDir: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    for await (const entry of walk(artifactsDir, { match: [/manifest\.json$/], includeDirs: false })) {
      try {
        const content = await Deno.readTextFile(entry.path);
        const data = JSON.parse(content);
        const permissions = data.permissions || [];
        const risky = permissions.filter((p: string) => HIGH_RISK_PERMISSIONS.includes(p));

        if (risky.length > 0) {
          findings.push({
            id: `EXT-${basename(dirname(entry.path))}`,
            scanner: this.name,
            title: `Risky Extension: ${data.name || "Unknown"}`,
            severity: "critical",
            description: `A browser extension with session-hijacking capabilities was found.`,
            evidence: content,
            path: entry.path,
            redFlags: risky
          });
        }
      } catch { }
    }
    return findings;
  }
}
