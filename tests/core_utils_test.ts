import { assertEquals, assertRejects, assertInstanceOf } from "@std/assert";
import { retry, withTimeout, CircuitBreaker, CircuitState } from "@core/utils/resilience.ts";
import { BoundedMap } from "@core/utils/collections.ts";
import { SecretRedactor } from "@core/utils/security.ts";

Deno.test("Resilience Utils - retry with exponential backoff", async () => {
    let attempts = 0;
    const result = await retry(async () => {
        attempts++;
        if (attempts < 3) throw new Error("Temporary failure");
        return "success";
    }, { maxAttempts: 3, baseDelayMs: 10 });

    assertEquals(result.success, true);
    if (result.success) assertEquals(result.data, "success");
    assertEquals(attempts, 3);
});

Deno.test("Resilience Utils - retry failure after max attempts", async () => {
    let attempts = 0;
    const result = await retry(async () => {
        attempts++;
        throw new Error("Permanent failure");
    }, { maxAttempts: 3, baseDelayMs: 10 });

    assertEquals(result.success, false);
    assertEquals(attempts, 3);
});

Deno.test("Resilience Utils - withTimeout success", async () => {
    const result = await withTimeout(Promise.resolve("done"), 100);
    assertEquals(result, "done");
});

Deno.test("Resilience Utils - withTimeout failure", async () => {
    let testTimer: number;
    const latePromise = new Promise(r => {
        testTimer = setTimeout(() => r("late"), 200);
    });

    try {
        await assertRejects(
            () => withTimeout(latePromise, 50),
            Error,
            "Operation timed out"
        );
    } finally {
        clearTimeout(testTimer!);
    }
});

Deno.test("Resilience Utils - CircuitBreaker lifecycle", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 50 });

    // 1. Initial State
    assertEquals(breaker.getState(), CircuitState.CLOSED);

    // 2. Trip the breaker
    await breaker.execute(() => Promise.reject(new Error("fail 1")));
    await breaker.execute(() => Promise.reject(new Error("fail 2")));
    assertEquals(breaker.getState(), CircuitState.OPEN);

    // 3. Rejected while open
    const res = await breaker.execute(() => Promise.resolve("won't run"));
    assertEquals(res.success, false);
    if (!res.success) assertEquals(res.error.message.includes("OPEN"), true);

    // 4. Half-open and Recover
    await new Promise(r => setTimeout(r, 60));
    const recoveryRes = await breaker.execute(() => Promise.resolve("recovered"));
    assertEquals(recoveryRes.success, true);
    assertEquals(breaker.getState(), CircuitState.CLOSED);
});

Deno.test("Collections - BoundedMap LRU eviction", () => {
    const map = new BoundedMap<string, number>(3);

    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    assertEquals(map.size, 3);

    // Access "a" to move it to head
    map.get("a");

    // "b" is now oldest
    map.set("d", 4);
    assertEquals(map.size, 3);
    assertEquals(map.has("b"), false);
    assertEquals(map.has("a"), true);
    assertEquals(map.has("d"), true);
});

Deno.test("Security Utils - SecretRedactor", () => {
    const redactor = new SecretRedactor({
        API_TOKEN: "SUPER_SECRET_TOKEN_1234567890",
        MESH_SECRET: "ANOTHER_SECRET_VALUE_987654321"
    });

    const raw = "Connecting with token SUPER_SECRET_TOKEN_1234567890 to mesh ANOTHER_SECRET_VALUE_987654321";
    const redacted = redactor.redact(raw);

    assertEquals(redacted, "Connecting with token [REDACTED] to mesh [REDACTED]");

    const obj = {
        msg: "Error with token SUPER_SECRET_TOKEN_1234567890",
        nested: { secret: "ANOTHER_SECRET_VALUE_987654321" }
    };
    const redactedObj = redactor.redactObject(obj);
    assertEquals(redactedObj.msg, "Error with token [REDACTED]");
    assertEquals(redactedObj.nested.secret, "[REDACTED]");
});
