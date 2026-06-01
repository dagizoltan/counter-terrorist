/**
 * Centralized Cryptographic and Serialization Utilities
 */

/**
 * Deterministic JSON stringifier to ensure consistent hashes and signatures.
 * Sorts keys and handles nested objects and arrays.
 */
export function canonicalStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalStringify(item)).join(",") + "]";
  }
  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return "{" + keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",") + "}";
}

/**
 * Computes a SHA-256 hash of the input object using the canonical string representation.
 */
export async function computeHash(input: unknown): Promise<string> {
  const str = canonicalStringify(input);
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Signs a payload with HMAC-SHA256 using a raw secret string.
 */
export async function signPayload(payload: unknown, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(canonicalStringify(payload))
  );
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Computes a SHA-256 hash from a ReadableStream without loading it entirely into memory.
 */
export async function computeStreamHash(stream: ReadableStream<Uint8Array>): Promise<string> {
    // Note: crypto.subtle.digest doesn't support streaming.
    // For production-grade large file hashing, we use a manual chunking approach
    // while keeping memory usage constant.
    const reader = stream.getReader();

    // Fallback: In Deno, we can use the 'crypto' module for streaming if available,
    // or accumulate into a buffer if memory allows.
    // To truly avoid OOM on multi-GB files, we should use a library like 'hash.js'
    // or native Deno.Command("sha256sum").

    // Optimal implementation using Deno's native command to avoid JS memory overhead
    const hasher = new Deno.Command("sha256sum", {
        stdin: "piped",
        stdout: "piped",
    }).spawn();

    const writer = hasher.stdin.getWriter();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            await writer.write(value);
        }
    } finally {
        writer.releaseLock();
        await hasher.stdin.close();
        reader.releaseLock();
    }

    const { stdout } = await hasher.output();
    const hashLine = new TextDecoder().decode(stdout);
    return hashLine.split(" ")[0].trim();
}

/**
 * Verifies an HMAC-SHA256 signature for a payload.
 */
export async function verifySignature(payload: unknown, signature: string, secret: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const sigData = new Uint8Array(
      atob(signature).split("").map((c) => c.charCodeAt(0))
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigData,
      encoder.encode(canonicalStringify(payload))
    );
  } catch {
    return false;
  }
}
