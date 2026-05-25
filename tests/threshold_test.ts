import { assertEquals } from "@std/assert";
import { splitSecret, reconstructSecret, SecretShare } from "../src/orchestrator/core/utils/threshold.ts";

Deno.test("Threshold Utils - Split and Reconstruct Secret", () => {
    const secret = new TextEncoder().encode("SUPER_SECRET_RECOVERY_KEY_2026!");
    const n = 5;
    const k = 3;

    const shares = splitSecret(secret, n, k);
    assertEquals(shares.length, n);

    // Test with exactly k shares
    const subset = shares.slice(0, k);
    const recovered = reconstructSecret(subset);
    assertEquals(new TextDecoder().decode(recovered), "SUPER_SECRET_RECOVERY_KEY_2026!");

    // Test with more than k shares
    const recoveredAll = reconstructSecret(shares);
    assertEquals(new TextDecoder().decode(recoveredAll), "SUPER_SECRET_RECOVERY_KEY_2026!");
});

Deno.test("Threshold Utils - Failure with less than k shares", () => {
    const secret = new TextEncoder().encode("TOP_SECRET");
    const n = 5;
    const k = 3;

    const shares = splitSecret(secret, n, k);

    // With k-1 shares, reconstruction should fail to yield the original secret
    const subset = shares.slice(0, k - 1);
    const recovered = reconstructSecret(subset);
    const recoveredStr = new TextDecoder().decode(recovered);

    assertEquals(recoveredStr !== "TOP_SECRET", true);
});
