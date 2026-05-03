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
    console.error(`[NETWORK] Failed to detect default interface: ${e}`);
  }

  return "eth0"; // Ultimate fallback
}
