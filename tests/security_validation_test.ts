import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CommandManager } from "../orchestrator/infrastructure/command_manager.ts";
import { isValidIP } from "../orchestrator/infrastructure/validation.ts";

Deno.test("IP Validation Regex", () => {
  // Valid IPv4
  assertEquals(isValidIP("127.0.0.1"), true);
  assertEquals(isValidIP("192.168.1.1"), true);
  assertEquals(isValidIP("255.255.255.255"), true);

  // Invalid IPv4
  assertEquals(isValidIP("256.0.0.1"), false);
  assertEquals(isValidIP("1.2.3"), false);
  assertEquals(isValidIP("a.b.c.d"), false);
  assertEquals(isValidIP("1.2.3.4.5"), false);

  // Valid IPv6
  assertEquals(isValidIP("::1"), true);
  assertEquals(isValidIP("2001:0db8:85a3:0000:0000:8a2e:0370:7334"), true);
  assertEquals(isValidIP("2001:db8:85a3::8a2e:370:7334"), true);

  // Invalid IPv6
  assertEquals(isValidIP("2001:db8:85a3:::8a2e:370:7334"), false);
  assertEquals(isValidIP("not an ip"), false);
});

Deno.test("CommandManager Sidecar Allowlist", async () => {
  const cm = new CommandManager();

  // blocker is allowed
  // Note: runSidecar will try to find the binary, so we just check it doesn't fail on allowlist
  const result = await cm.runSidecar("blocker", ["{}"]);
  // It should fail because the binary is not found, but NOT because of allowlist
  assertEquals(result.stderr.includes("not in the allowlist"), false);

  // unauthorized is NOT allowed
  const result2 = await cm.runSidecar("unauthorized", []);
  assertEquals(result2.stderr.includes("is not in the allowlist"), true);

  // getPersistentSidecar should also block unauthorized
  await assertRejects(
    async () => {
      await cm.getPersistentSidecar("unauthorized");
    },
    Error,
    "is not in the allowlist"
  );
});
