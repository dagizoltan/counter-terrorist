import { SystemExecutor } from "./system_executor.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export type PlatformName = "windows" | "ubuntu" | "macos" | "unknown";

export interface PlatformInfo {
  name: PlatformName;
  version: string;
  tag: string;
  metrics?: {
    memory: { total: number; free: number; used: number };
    cpu: { load: number[]; cores: number };
    disk: { total: number; free: number; used: number };
    uptime: number;
    hostname: string;
  };
}

const WINDOWS_TAG = "windows_11";

function normalizeVersion(version: string): string {
  return version.trim().replace(/[^0-9.]/g, "");
}

async function detectLinuxVersion(): Promise<string> {
  try {
    const content = await Deno.readTextFile("/etc/os-release");
    const versionMatch = content.match(/^VERSION_ID="?(.*?)"?$/m);
    if (versionMatch) {
      return normalizeVersion(versionMatch[1]);
    }
  } catch (e) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:infra:system:platform",
        message: `Failed to detect Linux version: ${e instanceof Error ? e.message : String(e)}`
    });
  }
  return "unknown";
}

async function detectMacosVersion(executor: SystemExecutor): Promise<string> {
  try {
    const { success, stdout } = await executor.execute("sw_vers", ["-productVersion"]);
    if (!success) return "unknown";
    return normalizeVersion(stdout);
  } catch (e) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:infra:system:platform",
        message: `Failed to detect MacOS version: ${e instanceof Error ? e.message : String(e)}`
    });
    return "unknown";
  }
}

async function getMetrics(): Promise<PlatformInfo["metrics"]> {
  try {
    // Use native Deno APIs if available (requires --allow-sys)
    const mem = Deno.systemMemoryInfo();
    const load = Deno.loadavg();
    const hostname = Deno.hostname();

    // Uptime is not directly available in Deno sys API yet, fallback to /proc/uptime on Linux
    let uptime = 0;
    if (Deno.build.os === "linux") {
      try {
        const uptimeStr = await Deno.readTextFile("/proc/uptime");
        uptime = parseFloat(uptimeStr.split(" ")[0]);
      } catch {
        // Fallback
      }
    }

    return {
      memory: { 
        total: mem.total, 
        free: mem.free + mem.available, // Best effort approximation
        used: mem.total - mem.available 
      },
      cpu: { load, cores: navigator.hardwareConcurrency },
      disk: { total: 0, free: 0, used: 0 },
      uptime,
      hostname,
    };
  } catch (e) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:infra:system:platform",
        message: `Failed to get native metrics: ${e instanceof Error ? e.message : String(e)}. Attempting /proc fallback...`
    });

    // Fallback to manual /proc parsing if native API fails (legacy or permission issues)
    if (Deno.build.os === "linux") {
      try {
        const meminfo = await Deno.readTextFile("/proc/meminfo");
        const totalMem = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || "0") * 1024;
        const freeMem = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || "0") * 1024;

        const loadavg = await Deno.readTextFile("/proc/loadavg");
        const load = loadavg.split(" ").slice(0, 3).map(parseFloat);

        const uptimeStr = await Deno.readTextFile("/proc/uptime");
        const uptime = parseFloat(uptimeStr.split(" ")[0]);

        return {
          memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
          cpu: { load, cores: navigator.hardwareConcurrency },
          disk: { total: 0, free: 0, used: 0 },
          uptime,
          hostname: Deno.hostname(),
        };
      } catch (inner) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "orchestrator:infra:system:platform",
            message: `Manual /proc fallback failed: ${inner instanceof Error ? inner.message : String(inner)}`
        });
      }
    }
    return undefined;
  }
}

export async function getPlatformInfo(executor: SystemExecutor): Promise<PlatformInfo> {
  const metrics = await getMetrics();
  const envOverride = Deno.env.get("CT_PLATFORM_TAG");
  
  let info: PlatformInfo;
  if (envOverride) {
    info = {
      name: envOverride.startsWith("windows") ? "windows" : envOverride.startsWith("ubuntu") ? "ubuntu" : envOverride.startsWith("macos") ? "macos" : "unknown",
      version: envOverride.split("_")[1] || "unknown",
      tag: envOverride,
    };
  } else {
    const os = Deno.build.os;
    if (os === "windows") {
      info = { name: "windows", version: "11", tag: WINDOWS_TAG };
    } else if (os === "darwin") {
      const version = await detectMacosVersion(executor);
      const major = version.split(".")[0] || "unknown";
      info = { name: "macos", version, tag: `macos_${major}` };
    } else if (os === "linux") {
      const version = await detectLinuxVersion();
      const tag = version.startsWith("24.04") ? "ubuntu_24.04" : version.startsWith("26.04") ? "ubuntu_26.04" : `ubuntu_${version}`;
      info = { name: "ubuntu", version, tag };
    } else {
      info = { name: "unknown", version: "unknown", tag: "unknown" };
    }
  }

  return { ...info, metrics };
}
