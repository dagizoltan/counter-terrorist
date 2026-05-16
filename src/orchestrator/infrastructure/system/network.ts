import { loggingService } from "@infrastructure/system/logging.ts";
import { LogSeverity, LogType } from "@core/ports.ts";

/**
 * Network utilities for interface discovery and validation.
 */
export async function getDefaultInterface(): Promise<string> {
  const isLinux = Deno.build.os === "linux";
  if (!isLinux) return "lo";

  try {
    // Attempt to find the default route interface using 'ip route'
    const command = new Deno.Command("ip", {
      args: ["route", "show", "default"],
      stdout: "piped",
      stderr: "null",
    });
    const { stdout, success } = await command.output();
    if (success) {
      const output = new TextDecoder().decode(stdout).trim();
      // Example output: "default via 192.168.1.1 dev eth0 proto dhcp metric 100"
      const match = output.match(/dev\s+(\S+)/);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Fallback: list all interfaces and pick the first non-loopback one
    const ifaces = Deno.networkInterfaces();
    const firstReal = ifaces.find(i => i.name !== "lo" && !i.name.startsWith("vboxnet") && !i.name.startsWith("docker"));
    if (firstReal) return firstReal.name;

  } catch (e) {
    loggingService.log({
        timestamp: new Date().toISOString(),
        type: LogType.GENERIC,
        severity: LogSeverity.ERROR,
        caller: "orchestrator:infra:system:network",
        message: `Failed to detect default interface: ${e instanceof Error ? e.message : String(e)}`
    });
  }

  return "eth0"; // Ultimate fallback
}

/**
 * Performs a safe fetch by using a pre-validated and resolved IP address.
 * This prevents DNS rebinding by ensuring the request is sent to the verified IP,
 * while maintaining the original Host header for compatibility.
 */
export async function safeFetch(url: string, resolvedIp: string, options: RequestInit = {}): Promise<Response> {
    const parsed = new URL(url);
    const originalHost = parsed.host;

    // Construct the safe URL using the IP address.
    // Use brackets for IPv6 literals.
    const isIpv6 = resolvedIp.includes(":");
    const safeHostname = isIpv6 ? `[${resolvedIp}]` : resolvedIp;

    const safeUrl = new URL(url);
    safeUrl.hostname = safeHostname;

    const headers = new Headers(options.headers || {});
    if (!headers.has("Host")) {
        headers.set("Host", originalHost);
    }

    return await fetch(safeUrl.toString(), {
        ...options,
        headers
    });
}
