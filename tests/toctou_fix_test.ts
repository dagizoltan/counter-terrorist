import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { UbuntuAntivirusProvider } from "../orchestrator/protection/providers/ubuntu_antivirus.ts";
import { SystemExecutor } from "../orchestrator/infrastructure/system_executor.ts";

Deno.test("UbuntuAntivirusProvider.quarantine - TOCTOU protection", async () => {
  const executor = new SystemExecutor();
  const provider = new UbuntuAntivirusProvider(executor);
  const testFile = "tests/toctou_test_file.txt";

  await Deno.writeTextFile(testFile, "initial content");

  try {
    const initialFileInfo = await Deno.lstat(testFile);

    // 1. Mock Deno.lstat to return specific values
    const lstatStub = stub(Deno, "lstat", async () => ({
      ...initialFileInfo,
      ino: 123,
      dev: 456,
      mtime: new Date(1000),
    } as any));

    // 2. Prepare a fake file for Deno.open
    const originalOpen = Deno.open;
    const fakeFile = await originalOpen(testFile, { read: true });

    // Override .stat() on the file handle to simulate a changed file
    fakeFile.stat = async () => ({
      ...initialFileInfo,
      ino: 999, // Different inode to trigger the mismatch
      dev: 456,
      mtime: new Date(1000),
    } as any);

    // 3. Stub Deno.open to return our fake file when the test file is opened
    const openStub = stub(Deno, "open", async (path, options) => {
      if (typeof path === "string" && path.includes("toctou_test_file.txt")) {
        return fakeFile;
      }
      // Use the originalOpen to avoid recursion
      return await originalOpen(path, options);
    });

    try {
      const result = await provider.quarantine(testFile);
      assertEquals(result.success, false);
      assertEquals(result.message.includes("Security Warning: File modified or replaced"), true);
    } finally {
      lstatStub.restore();
      openStub.restore();
      try { fakeFile.close(); } catch { /* ignore */ }
    }
  } finally {
    try { await Deno.remove(testFile); } catch { /* ignore */ }
  }
});
