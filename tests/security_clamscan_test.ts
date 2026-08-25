import { assertEquals } from "@std/assert";
import { UbuntuAntivirusProvider } from "@infrastructure/system/protection/antivirus/providers/ubuntu_antivirus.ts";

class MockSidecarManager {
  public lastCommand: any = null;

  async sendCommand(name: string, cmd: any) {
    this.lastCommand = { name, cmd };
    return { success: true, stdout: "Infected files: 0", stderr: "", data: {} };
  }
}

Deno.test("UbuntuAntivirusProvider.scanPath uses sidecar for analysis", async () => {
  const mockSidecar = new MockSidecarManager();
  const provider = new UbuntuAntivirusProvider(mockSidecar as any);

  const maliciousPath = "/tmp/test-file";
  await provider.scanPath(maliciousPath);

  assertEquals(mockSidecar.lastCommand.name, "analyzer");
  assertEquals(mockSidecar.lastCommand.cmd.type, "ScanPath");
  assertEquals(mockSidecar.lastCommand.cmd.path, maliciousPath);
});
