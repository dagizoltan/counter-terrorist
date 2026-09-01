import { Scanner, Finding, EngineConfig } from "./types.ts";
import { dirname } from "https://deno.land/std@0.224.0/path/mod.ts";

export class ParasiteEngine {
  private scanners: Scanner[] = [];

  constructor(private config: EngineConfig) {}

  registerScanner(scanner: Scanner) {
    this.scanners.push(scanner);
  }

  async run(): Promise<Finding[]> {
    const allFindings: Finding[] = [];
    for (const scanner of this.scanners) {
      console.log(`Running scanner: ${scanner.name}...`);
      const findings = await scanner.scan(this.config.artifactsDir);
      allFindings.push(...findings);
    }
    return allFindings;
  }

  async generateReport(findings: Finding[]) {
    let report = "# Parasite Detection Engine - Analysis Report\n\n";

    // Sort findings by severity
    const severityOrder: Record<string, number> = { "critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4 };
    findings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    for (const f of findings) {
      const flags = f.redFlags?.length ? ` [FLAGS: ${f.redFlags.join(", ")}]` : "";
      report += `## [${f.severity.toUpperCase()}] ${f.title}${flags}\n`;
      report += `**Scanner:** ${f.scanner}  \n`;
      if (f.path) report += `**Path:** ${f.path}  \n`;
      report += `\n${f.description}\n\n`;
      report += "### Evidence\n```\n";
      report += f.evidence.slice(0, 2000);
      report += "\n```\n\n---\n\n";
    }

    await Deno.mkdir(dirname(this.config.outputPath), { recursive: true });
    await Deno.writeTextFile(this.config.outputPath, report);
    console.log(`Report generated: ${this.config.outputPath}`);
  }
}
