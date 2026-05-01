import { assertEquals, assertNotEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { ApiKeysService, Role } from "@domain/identity/api_keys.ts";
import { LoggingService } from "@infrastructure/system/logging.ts";

Deno.test("ApiKeysService - Security and Role Management", async (t) => {
  const kv = await Deno.openKv(":memory:");
  const logging = new LoggingService();
  const apiKeys = new ApiKeysService(kv, logging);

  let rawKeyOperator: string;
  let idOperator: string;

  await t.step("Cannot create keys for admin/mesh_peer", async () => {
    try {
      await apiKeys.createApiKey("Test Admin", "admin");
      throw new Error("Should have failed");
    } catch (e: any) {
      assertEquals(e.message, "Cannot create API keys for internal or admin roles");
    }
  });

  await t.step("Create valid operator API key", async () => {
    const res = await apiKeys.createApiKey("Test Operator", "operator");
    rawKeyOperator = res.rawKey;
    idOperator = res.id;

    assertEquals(rawKeyOperator.startsWith("ct_operator_"), true);
    assertEquals(idOperator.length > 0, true);
  });

  await t.step("Raw key is NOT stored in KV", async () => {
    // Scan KV to ensure the raw key string isn't there
    const iter = kv.list({ prefix: [] });
    for await (const entry of iter) {
      if (typeof entry.value === "string") {
        assertNotEquals(entry.value, rawKeyOperator);
      }
      if (typeof entry.value === "object" && entry.value !== null) {
        const valStr = JSON.stringify(entry.value);
        assertEquals(valStr.includes(rawKeyOperator), false);
      }
    }
  });

  await t.step("Validate API key and resolve role", async () => {
    const role = await apiKeys.validateApiKey(rawKeyOperator);
    assertEquals(role, "operator");
  });

  await t.step("Reject invalid/forged API key", async () => {
    const role = await apiKeys.validateApiKey("ct_operator_invalid123");
    assertEquals(role, null);
  });

  await t.step("List API keys returns masked data", async () => {
    const keys = await apiKeys.listApiKeys();
    assertEquals(keys.length, 1);
    assertEquals(keys[0].name, "Test Operator");
    assertEquals(keys[0].role, "operator");
    assertEquals((keys[0] as any).rawKey, undefined); // Never returns raw key
  });

  await t.step("Revoke API key", async () => {
    await apiKeys.revokeApiKey(idOperator);
    const role = await apiKeys.validateApiKey(rawKeyOperator);
    assertEquals(role, null);
    
    const keys = await apiKeys.listApiKeys();
    assertEquals(keys.length, 0);
  });

  kv.close();
});
