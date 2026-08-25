import { assertEquals } from "@std/assert";
import { validatePath } from "../src/orchestrator/infrastructure/system/validation.ts";
import { join } from "@std/path";

Deno.test("Path Validation - Symlink Jailbreak Prevention", async () => {
    const tmpDir = await Deno.makeTempDir();
    const jailDir = join(tmpDir, "jail");
    const outsideDir = join(tmpDir, "outside");

    await Deno.mkdir(jailDir);
    await Deno.mkdir(outsideDir);

    const secretFile = join(outsideDir, "secret.txt");
    await Deno.writeTextFile(secretFile, "sensitive data");

    // 1. Create a symlink inside the jail pointing outside
    const linkPath = join(jailDir, "evil_link");
    await Deno.symlink(secretFile, linkPath);

    // 2. Validate path against the jail
    // The link itself is inside the jail, but it points outside.
    const isValid = validatePath(linkPath, [jailDir]);

    assertEquals(isValid, false, "Should reject symlink pointing outside jail");

    // Cleanup
    await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("Path Validation - Basic Jail Enforcement", () => {
    const jail = "/var/lib/cts/";
    assertEquals(validatePath("/var/lib/cts/bin/agent", [jail]), true);
    assertEquals(validatePath("/etc/shadow", [jail]), false);
    assertEquals(validatePath("/var/lib/cts-malicious/file", [jail]), false);
});
