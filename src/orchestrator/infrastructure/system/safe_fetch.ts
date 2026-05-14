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

  return await fetch(url, options);
}
