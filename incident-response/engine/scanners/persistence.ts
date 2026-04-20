import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { relative } from "https://deno.land/std@0.224.0/path/mod.ts";
import { Scanner, Finding } from "../types.ts";

const RED_FLAG_KEYWORDS = [/base64/i, /eval\(/i, /exec\(/i, /shell/i, /powershell/i, /hidden/i];

export class PersistenceScanner implements Scanner {
  name = "PersistenceScanner";

  async scan(artifactsDir: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    for await (const entry of walk(artifactsDir, {
      match: [/\.plist$/, /\.service$/, /\.txt$/, /\.json$/],
      includeDirs: false
    })) {
      if (entry.path.includes("/persistence/")) {
        const text = await Deno.readTextFile(entry.path);
        const flags = RED_FLAG_KEYWORDS.filter(r => r.test(text)).map(r => r.source);

        if (flags.length > 0) {
          findings.push({
            id: `PERSIST-${Math.random().toString(36).substr(2, 5)}`,
            scanner: this.name,
            title: `Suspicious Persistence: ${entry.name}`,
            severity: "high",
            description: `A persistence artifact containing red-flag keywords was identified.`,
            evidence: text,
            path: relative(artifactsDir, entry.path),
            redFlags: flags
          });
        }
      }
    }
    return findings;
  }
}
