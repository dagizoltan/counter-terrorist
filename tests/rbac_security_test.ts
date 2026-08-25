import { assertEquals, assertNotEquals } from "@std/assert";
import { ApiKeysService, Role } from "@domain/identity/api_keys.ts";
import { LoggingService } from "@infrastructure/system/logging.ts";
import { Result } from "@core/result.ts";

Deno.test("ApiKeysService - Security and Role Management", async (t) => {
  const kv = await Deno.openKv(":memory:");
  const logging = new LoggingService();
  const apiKeys = new ApiKeysService(kv, logging);

  let rawKeyOperator: string;
  let idOperator: string;

  await t.step("Cannot create keys for admin/mesh_peer", async () => {
    const res = await apiKeys.createApiKey("Test Admin", "admin");
    assertEquals(res.success, false);
    if (!res.success) {
      assertEquals(res.error.message, "Cannot create API keys for internal or admin roles");
    }
  });

  await t.step("Create valid operator API key", async () => {
    const res = await apiKeys.createApiKey("Test Operator", "operator");
    assertEquals(res.success, true);
    if (res.success) {
      rawKeyOperator = res.data.rawKey;
      idOperator = res.data.id;

      assertEquals(rawKeyOperator.startsWith("ct_operator_"), true);
      assertEquals(idOperator.length > 0, true);
    }
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
    const res = await apiKeys.validateApiKey(rawKeyOperator);
    assertEquals(res.success, true);
    if (res.success) {
      assertEquals(res.data, "operator");
    }
  });

  await t.step("Reject invalid/forged API key", async () => {
    const res = await apiKeys.validateApiKey("ct_operator_invalid123");
    assertEquals(res.success, true);
    if (res.success) {
      assertEquals(res.data, null);
    }
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
    const res = await apiKeys.validateApiKey(rawKeyOperator);
    assertEquals(res.success, true);
    if (res.success) {
      assertEquals(res.data, null);
    }
    
    const keys = await apiKeys.listApiKeys();
    assertEquals(keys.length, 0);
  });

  await logging.shutdown();
  kv.close();
});
