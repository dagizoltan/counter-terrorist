/**
 * Centralized Cryptographic and Serialization Utilities
 */

/**
 * Deterministic JSON stringifier to ensure consistent hashes and signatures.
 * Sorts keys and handles nested objects and arrays.
 *
 * SOV-M5: Hardened against JSON Bombs with recursion depth and breadth limits.
 */
export function canonicalStringify(obj: unknown, depth = 0): string {
  const MAX_DEPTH = 10;
  const MAX_BREADTH = 100;

  if (depth > MAX_DEPTH) {
    throw new Error(`Serialization Error: Max recursion depth (${MAX_DEPTH}) exceeded.`);
  }

  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    if (obj.length > MAX_BREADTH) {
        throw new Error(`Serialization Error: Max array breadth (${MAX_BREADTH}) exceeded.`);
    }
    return "[" + obj.map(item => canonicalStringify(item, depth + 1)).join(",") + "]";
  }

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record).sort();

  if (keys.length > MAX_BREADTH) {
      throw new Error(`Serialization Error: Max object breadth (${MAX_BREADTH}) exceeded.`);
  }

  return "{" + keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(record[key], depth + 1)}`).join(",") + "}";
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

/**
 * Generates a cryptographically secure random integer in a range [min, max].
 */
export function secureRandomInt(min: number, max: number): number {
    const range = max - min + 1;
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return min + (array[0] % range);
}

/**
 * Generates a cryptographically secure random boolean.
 */
export function secureRandomBool(): boolean {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    return array[0] > 127;
}
