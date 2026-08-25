import { assertEquals } from "@std/assert";
import { WindowsPersistenceProvider } from "@infrastructure/system/protection/persistence/providers/windows_persistence.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { CommandResult } from "@core/ports.ts";

class MockExecutor extends SystemExecutor {
  lastCmd: string = "";
  lastArgs: string[] = [];

  override async execute(cmd: string, args: string[] = []): Promise<CommandResult> {
    this.lastCmd = cmd;
    this.lastArgs = args;
    return { success: true, stdout: "[]", stderr: "", data: [] };
  }
}

Deno.test("WindowsPersistenceProvider uses -EncodedCommand", async () => {
  const executor = new MockExecutor();
  const provider = new WindowsPersistenceProvider(executor);

  await provider.auditPersistence();

  assertEquals(executor.lastCmd, "powershell");
  assertEquals(executor.lastArgs[0], "-EncodedCommand");

  const encoded = executor.lastArgs[1];
  // Verify it's valid base64
  const decodedBytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));

  // Verify it's UTF-16LE (every second byte should be 0 for ASCII script)
  let looksLikeUtf16Le = true;
  for (let i = 1; i < decodedBytes.length; i += 2) {
    if (decodedBytes[i] !== 0) {
      looksLikeUtf16Le = false;
      break;
    }
  }
  assertEquals(looksLikeUtf16Le, true);

  // Decode back to string
  const decoder = new TextDecoder("utf-16le");
  const decodedScript = decoder.decode(decodedBytes);

  assertEquals(decodedScript.includes("$anomalies = @()"), true);
  assertEquals(decodedScript.includes("ConvertTo-Json"), true);
});
