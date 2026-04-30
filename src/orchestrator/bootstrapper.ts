/**
 * Bootstrapper for the Security Orchestrator.
 * Handles OS detection, dependency verification, and permission checks.
 */

import { getPlatformInfo } from "@infrastructure/system/platform.ts";

export interface SystemStatus {
  os: string;
  platformTag: string;
  isRoot: boolean;
  dependencies: Record<string, boolean>;
}

export async function checkDependency(cmd: string): Promise<boolean> {
  try {
    const command = new Deno.Command("which", {
      args: [cmd],
    });
    const { success } = await command.output();
    return success;
  } catch {
    // For Windows 'which' doesn't exist, we might need 'where'
    try {
      const command = new Deno.Command("where", {
        args: [cmd],
      });
      const { success } = await command.output();
      return success;
    } catch {
      return false;
    }
  }
}

export async function bootstrap(): Promise<SystemStatus> {
  const platformInfo = await getPlatformInfo();
  const os = Deno.build.os;
  const isRoot = os === "windows" ? true : (Deno.uid?.() === 0); // Simplified for Windows

  const deps: string[] = ["cargo"];
  if (os === "linux") deps.push("ufw", "ss");
  if (os === "darwin") deps.push("launchctl", "system_profiler");
  if (os === "windows") deps.push("powershell");

  const dependencies: Record<string, boolean> = {};
  for (const dep of deps) {
    dependencies[dep] = await checkDependency(dep);
  }

  return {
    os,
    platformTag: platformInfo.tag,
    isRoot,
    dependencies,
  };
}

if (import.meta.main) {
  console.log("--- Initializing Security Orchestrator Bootstrapper ---");
  const status = await bootstrap();
  console.log(`OS: ${status.os}`);
  console.log(`Elevated Privileges: ${status.isRoot ? "YES" : "NO"}`);
  console.log("Dependencies:");
  for (const [dep, found] of Object.entries(status.dependencies)) {
    console.log(`  - ${dep}: ${found ? "FOUND" : "NOT FOUND"}`);
  }

  if (!status.dependencies.cargo) {
    console.warn("\n[WARNING] 'cargo' not found. Rust sidecars cannot be compiled from source.");
  }

  if (!status.isRoot) {
    console.warn("\n[WARNING] Running without root/admin privileges. Active blocking and deep auditing will be limited.");
  }
}
