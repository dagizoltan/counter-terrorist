import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { UbuntuAntivirusProvider } from "@infrastructure/system/protection/providers/ubuntu_antivirus.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

class MockSystemExecutor extends SystemExecutor {
  public lastCmd: string = "";
  public lastArgs: string[] = [];

  override async execute(cmd: string, args: string[] = []): Promise<any> {
    this.lastCmd = cmd;
    this.lastArgs = args;

    if (cmd === "which" && args[0] === "clamscan") {
      return { success: true, stdout: "/usr/bin/clamscan", stderr: "" };
    }

    return { success: true, stdout: "Infected files: 0", stderr: "" };
  }
}

Deno.test("UbuntuAntivirusProvider.scanPath uses -- separator for clamscan", async () => {
  const mockExecutor = new MockSystemExecutor();
  const provider = new UbuntuAntivirusProvider(mockExecutor as any);

  const maliciousPath = "/tmp/--help";
  await provider.scanPath(maliciousPath);

  assertEquals(mockExecutor.lastCmd, "clamscan");
  // This test is expected to FAIL before the fix
  const hasSeparator = mockExecutor.lastArgs.includes("--");
  assertEquals(hasSeparator, true, "Should include -- separator to prevent argument injection");
  assertEquals(mockExecutor.lastArgs[mockExecutor.lastArgs.length - 1], "/tmp/--help");
});
