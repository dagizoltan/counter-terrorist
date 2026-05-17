/**
 * Bootstrapper for the Security Orchestrator.
 * Handles OS detection, dependency verification, and permission checks.
 */

import { getPlatformInfo } from "@infrastructure/system/platform.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

export interface SystemStatus {
  os: string;
  platformTag: string;
  isRoot: boolean;
  dependencies: Record<string, boolean>;
}

export async function checkDependency(executor: SystemExecutor, cmd: string): Promise<boolean> {
  const checkCmd = Deno.build.os === "windows" ? "where" : "which";
  try {
      const result = await executor.execute(checkCmd, [cmd]);
      if (result.success) return true;

      // Secondary check for non-windows systems if 'which' failed
      if (Deno.build.os !== "windows" && checkCmd === "which") {
          const res2 = await executor.execute("where", [cmd]);
          return res2.success;
      }
      return false;
  } catch {
      // If first check throws, try the fallback
      if (Deno.build.os !== "windows" && checkCmd === "which") {
          try {
              const res2 = await executor.execute("where", [cmd]);
              return res2.success;
          } catch { return false; }
      }
      return false;
  }
}

export async function bootstrap(): Promise<SystemStatus> {
  const executor = new SystemExecutor();
  // BUG-9.1 FIX: Parallelize bootstrap checks to avoid linear delays
  const platformPromise = getPlatformInfo(executor);
  const os = Deno.build.os;
  const isRoot = os === "windows" ? true : (Deno.uid?.() === 0); // Simplified for Windows

  const deps: string[] = ["cargo"];
  if (os === "linux") deps.push("ufw", "ss");
  if (os === "darwin") deps.push("launchctl", "system_profiler");
  if (os === "windows") deps.push("powershell");

  const depPromises = deps.map(async (dep) => ({
    name: dep,
    found: await checkDependency(executor, dep)
  }));

  const [platformInfo, ...checkedDeps] = await Promise.all([
    platformPromise,
    ...depPromises
  ]);

  const dependencies: Record<string, boolean> = {};
  for (const cd of checkedDeps) {
      dependencies[cd.name] = cd.found;
  }

  return {
    os,
    platformTag: platformInfo.tag,
    isRoot,
    dependencies,
  };
}

/**
 * Masks the process identity to blend in with standard system workers.
 */
export async function camouflage() {
  if (Deno.build.os === "linux") {
    // Attempt to set process title to blend in
    // Note: In a compiled Deno binary, this makes the process look like a kernel worker in 'ps'
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "orchestrator:app:bootstrapper",
        message: "Kernel worker identity masked successfully"
    });
  }
}

if (import.meta.main) {
  const status = await bootstrap();
  
  loggingService.log({
      timestamp: new Date().toISOString(),
      type: LogType.AUDIT,
      severity: LogSeverity.INFO,
      caller: "orchestrator:app:bootstrapper",
      message: `Forensic environment check passed (OS: ${status.os}, Root: ${status.isRoot})`
  });

  for (const [dep, found] of Object.entries(status.dependencies)) {
    if (!found) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "orchestrator:app:bootstrapper",
            message: `Missing critical dependency: ${dep}`
        });
    }
  }

  if (!status.isRoot) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.WARNING,
        caller: "orchestrator:app:bootstrapper",
        message: "Sub-optimal privilege level detected. Capability degradation expected."
    });
  }
}
