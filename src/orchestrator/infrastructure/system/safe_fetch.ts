import { isValidWebhookUrl, isValidIP } from "./validation.ts";

/**
 * A security-hardened fetch wrapper that mitigates SSRF (Server-Side Request Forgery).
 * It enforces:
 * 1. Only HTTPS scheme.
 * 2. Blocking of loopback, link-local, and RFC1918 private ranges.
 * 3. Blocking of cloud metadata endpoints.
 * 4. DNS resolution verification to prevent DNS-based bypasses.
 */
import { validateWebhookUrlAsync } from "./validation.ts";

/**
 * A security-hardened fetch wrapper that mitigates SSRF (Server-Side Request Forgery).
 * It enforces protocol, destination, and DNS resolution checks.
 */
export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const check = await validateWebhookUrlAsync(url);
  if (!check.valid) {
    throw new Error(`SSRF Prevention: ${check.reason}`);
  }

  // To prevent DNS Rebinding attacks, we use the resolved IP address
  // that was just validated, while preserving the original Host header.
  if (check.resolvedIp) {
    const parsed = new URL(url);
    const protocol = parsed.protocol;
    const port = parsed.port ? `:${parsed.port}` : "";
    const path = parsed.pathname + parsed.search + parsed.hash;

    // Ensure IPv6 literals are properly bracketed for URL construction
    const ip = (check.resolvedIp.includes(":") && !check.resolvedIp.startsWith("["))
        ? `[${check.resolvedIp}]`
        : check.resolvedIp;

    const targetUrl = `${protocol}//${ip}${port}${path}`;

    const headers = new Headers(options?.headers);
    if (!headers.has("Host")) {
      headers.set("Host", parsed.hostname);
    }

    return await fetch(targetUrl, {
      ...options,
      headers
    });
  }

  return await fetch(url, options);
}
