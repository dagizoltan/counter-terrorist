/**
 * Centralized Cryptographic and Serialization Utilities
 */

/**
 * Deterministic JSON stringifier to ensure consistent hashes and signatures.
 * Sorts keys and handles nested objects and arrays.
 */
export function canonicalStringify(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(item => canonicalStringify(item)).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return "{" + keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`).join(",") + "}";
}

/**
 * Computes a SHA-256 hash of the input object using the canonical string representation.
 */
export async function computeHash(input: any): Promise<string> {
  const str = canonicalStringify(input);
  const data = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Signs a payload with HMAC-SHA256 using a raw secret string.
 */
export async function signPayload(payload: any, secret: string): Promise<string> {
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
 * Verifies an HMAC-SHA256 signature for a payload.
 */
export async function verifySignature(payload: any, signature: string, secret: string): Promise<boolean> {
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
