import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validatePath, isValidWebhookUrl, isPrivateIp } from "../src/orchestrator/infrastructure/system/validation.ts";

Deno.test("validatePath - Traversal Protection", () => {
  assertEquals(validatePath("test.txt"), true);
  assertEquals(validatePath("../etc/passwd"), false);
  assertEquals(validatePath("test/../etc/passwd"), false);
  assertEquals(validatePath("./test.txt"), true);
  assertEquals(validatePath("/tmp/test.txt"), true);
});

Deno.test("validatePath - Multi-level Encoding", () => {
  // %2e is .
  assertEquals(validatePath("%2e%2e/etc/passwd"), false);
  // %252e is %2e which is .
  assertEquals(validatePath("%252e%252e/etc/passwd"), false);
});

Deno.test("validatePath - Null Byte Rejection", () => {
  assertEquals(validatePath("test.txt\0.jpg"), false);
});

Deno.test("validatePath - Jail Enforcement", () => {
  const jail = ["/home/", "/tmp/"];
  assertEquals(validatePath("/home/user/test.txt", jail), true);
  assertEquals(validatePath("/tmp/test.txt", jail), true);
  assertEquals(validatePath("/etc/passwd", jail), false);
  assertEquals(validatePath("/home-malicious/test.txt", jail), false); // Prefix bypass check
});

Deno.test("isValidWebhookUrl - SSRF Protection", () => {
  assertEquals(isValidWebhookUrl("https://google.com").valid, true);
  assertEquals(isValidWebhookUrl("http://google.com").valid, false); // Only HTTPS
  assertEquals(isValidWebhookUrl("https://localhost").valid, false);
  assertEquals(isValidWebhookUrl("https://127.0.0.1").valid, false);
  assertEquals(isValidWebhookUrl("https://169.254.169.254").valid, false);
  assertEquals(isValidWebhookUrl("https://192.168.1.1").valid, false);
});

Deno.test("isPrivateIp - Edge Cases", () => {
  assertEquals(isPrivateIp("8.8.8.8"), false);
  assertEquals(isPrivateIp("10.0.0.1"), true);
  assertEquals(isPrivateIp("172.16.0.1"), true);
  assertEquals(isPrivateIp("192.168.0.1"), true);
  assertEquals(isPrivateIp("fc00::1"), true);
  assertEquals(isPrivateIp("fe80::1"), true);
});
