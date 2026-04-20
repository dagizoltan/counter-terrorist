import { walk } from "https://deno.land/std@0.224.0/fs/walk.ts";
import { Scanner, Finding } from "../types.ts";

export class NetworkScanner implements Scanner {
  name = "NetworkScanner";

  async scan(artifactsDir: string): Promise<Finding[]> {
    const findings: Finding[] = [];
    for await (const entry of walk(artifactsDir, { match: [/netstat\.txt$/], includeDirs: false })) {
      const content = await Deno.readTextFile(entry.path);
      const established = content.split("\n")
        .filter(l => l.includes("ESTABLISHED") && !l.includes("127.0.0.1") && !l.includes("::1"));

      if (established.length > 0) {
        findings.push({
          id: `NET-${Math.random().toString(36).substr(2, 5)}`,
          scanner: this.name,
          title: `Active External Connections`,
          severity: "medium",
          description: `Identified active established connections to non-local IP addresses.`,
          evidence: established.join("\n"),
          path: entry.path
        });
      }
    }
    return findings;
  }
}
