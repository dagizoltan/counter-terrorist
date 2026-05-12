import { isValidWebhookUrl, isValidIP } from "./validation.ts";

/**
 * A security-hardened fetch wrapper that mitigates SSRF (Server-Side Request Forgery).
 * It enforces:
 * 1. Only HTTPS scheme.
 * 2. Blocking of loopback, link-local, and RFC1918 private ranges.
 * 3. Blocking of cloud metadata endpoints.
 * 4. DNS resolution verification to prevent DNS-based bypasses.
 */
export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  // 1. Initial URL check (covers explicit IPs and obvious local hostnames)
  const urlCheck = isValidWebhookUrl(url);
  if (!urlCheck.valid) {
    throw new Error(`SSRF Prevention: ${urlCheck.reason}`);
  }

  const parsed = new URL(url);
  const hostname = parsed.hostname;

  // 2. DNS Resolution Check
  // Even if the hostname passed the initial check (e.g. "my-internal-host.local"),
  // it might resolve to a private IP.
  if (!isValidIP(hostname)) {
    try {
      // Resolve A records (IPv4)
      const ips = await Deno.resolveDns(hostname, "A").catch(() => []);
      for (const ip of ips) {
        const ipCheck = isValidWebhookUrl(`https://${ip}`);
        if (!ipCheck.valid) {
          throw new Error(`SSRF Prevention: Domain '${hostname}' resolves to restricted IP '${ip}'`);
        }
      }

      // Resolve AAAA records (IPv6)
      const ipv6s = await Deno.resolveDns(hostname, "AAAA").catch(() => []);
      for (const ip of ipv6s) {
        const ipCheck = isValidWebhookUrl(`https://[${ip}]`);
        if (!ipCheck.valid) {
          throw new Error(`SSRF Prevention: Domain '${hostname}' resolves to restricted IPv6 '${ip}'`);
        }
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("SSRF")) {
        throw e;
      }
      // DNS resolution failure is handled by the final fetch or ignored if records don't exist
    }
  }

  return await fetch(url, options);
}
