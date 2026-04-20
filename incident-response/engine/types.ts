export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  id: string;
  scanner: string;
  title: string;
  severity: Severity;
  description: string;
  evidence: string;
  path?: string;
  redFlags?: string[];
}

export interface Scanner {
  name: string;
  scan(artifactsDir: string): Promise<Finding[]>;
}

export interface EngineConfig {
  artifactsDir: string;
  outputPath: string;
  quarantineDir: string;
}
