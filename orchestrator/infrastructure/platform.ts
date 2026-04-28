export type PlatformName = "windows" | "ubuntu" | "macos" | "unknown";

export interface PlatformInfo {
  name: PlatformName;
  version: string;
  tag: string;
}

const WINDOWS_TAG = "windows_11";
const MACOS_LATEST_TAGS = ["macos_15", "macos_14"];

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
  } catch {
    // ignore
  }
  return "unknown";
}

async function detectMacosVersion(): Promise<string> {
  try {
    const command = new Deno.Command("sw_vers", {
      args: ["-productVersion"],
      stdout: "piped",
      stderr: "null",
    });
    const { stdout } = await command.output();
    const version = new TextDecoder().decode(stdout).trim();
    return normalizeVersion(version);
  } catch {
    return "unknown";
  }
}

export async function getPlatformInfo(): Promise<PlatformInfo> {
  const envOverride = Deno.env.get("CT_PLATFORM_TAG");
  if (envOverride) {
    return {
      name: envOverride.startsWith("windows") ? "windows" : envOverride.startsWith("ubuntu") ? "ubuntu" : envOverride.startsWith("macos") ? "macos" : "unknown",
      version: envOverride.split("_")[1] || "unknown",
      tag: envOverride,
    };
  }

  const os = Deno.build.os;
  if (os === "windows") {
    return {
      name: "windows",
      version: "11",
      tag: WINDOWS_TAG,
    };
  }

  if (os === "darwin") {
    const version = await detectMacosVersion();
    const major = version.split(".")[0] || "unknown";
    const tag = MACOS_LATEST_TAGS.includes(`macos_${major}`) ? `macos_${major}` : `macos_${major}`;
    return {
      name: "macos",
      version,
      tag,
    };
  }

  if (os === "linux") {
    const version = await detectLinuxVersion();
    const tag = version.startsWith("24.04") ? "ubuntu_24.04" : version.startsWith("26.04") ? "ubuntu_26.04" : `ubuntu_${version}`;
    return {
      name: "ubuntu",
      version,
      tag,
    };
  }

  return {
    name: "unknown",
    version: "unknown",
    tag: "unknown",
  };
}
