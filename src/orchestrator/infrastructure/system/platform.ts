import { SystemExecutor } from "./system_executor.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

export type PlatformName = "windows" | "ubuntu" | "macos" | "unknown";

export interface PlatformInfo {
  name: PlatformName;
  version: string;
  tag: string;
  isRoot?: boolean;
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

async function getMetrics(executor?: SystemExecutor): Promise<PlatformInfo["metrics"]> {
  const isLinux = Deno.build.os === "linux";
  if (!isLinux) return undefined;

  try {
    const meminfo = await Deno.readTextFile("/proc/meminfo");
    const totalMem = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || "0") * 1024;
    const freeMem = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || "0") * 1024;

    const loadavg = await Deno.readTextFile("/proc/loadavg");
    const load = loadavg.split(" ").slice(0, 3).map(parseFloat);

    const uptimeStr = await Deno.readTextFile("/proc/uptime");
    const uptime = parseFloat(uptimeStr.split(" ")[0]);

    const hostname = Deno.hostname();

    // BUG-5.3 FIX: Implement real disk metrics
    let disk = { total: 0, free: 0, used: 0 };
    if (executor) {
        const { success, stdout } = await executor.execute("df", ["--block-size=1", "/"]);
        if (success) {
            const lines = stdout.split("\n");
            if (lines.length > 1) {
                const parts = lines[1].split(/\s+/);
                if (parts.length >= 4) {
                    disk = {
                        total: parseInt(parts[1]),
                        used: parseInt(parts[2]),
                        free: parseInt(parts[3])
                    };
                }
            }
        }
    }

    return {
      memory: { total: totalMem, free: freeMem, used: totalMem - freeMem },
      cpu: { load, cores: navigator.hardwareConcurrency },
      disk,
      uptime,
      hostname,
    };
  } catch (e) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:infra:system:platform",
        message: `Failed to get metrics: ${e instanceof Error ? e.message : String(e)}`
    });
    return undefined;
  }
}

export async function getPlatformInfo(executor: SystemExecutor): Promise<PlatformInfo> {
  const metrics = await getMetrics(executor);
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
