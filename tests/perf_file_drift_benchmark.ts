import { BaselineService, FileSnapshot } from "@domain/analysis/baseline.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LoggingPort } from "@core/ports.ts";

// Mock dependencies
const mockKv = {
  get: async () => ({ value: null }),
  set: async () => {},
} as any;

const mockSidecar = {
  sendCommand: async () => ({ processes: [], files: [] }),
} as unknown as SidecarManager;

const mockExecutor = {
  execute: async () => ({ stdout: "", stderr: "" }),
} as unknown as SystemExecutor;

const mockLogging = {
  log: async () => {},
} as unknown as LoggingPort;

function generateFiles(count: number): FileSnapshot[] {
  const files: FileSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    files.push({
      path: `/usr/local/bin/file-${i}.sh`,
      hash: `hash-${i}`,
      mtime: new Date().toISOString(),
    });
  }
  return files;
}

async function runBenchmark(numFiles: number, iterations: number = 100) {
  console.log(`--- Benchmarking with ${numFiles} changed files ---`);

  const service = new BaselineService(mockKv, mockSidecar, mockExecutor, mockLogging);

  // Set initial baseline (empty)
  (mockSidecar.sendCommand as any) = async () => ({ processes: [], files: [] });
  await service.setBaseline();

  // Prepare changed files
  const changedFiles = generateFiles(numFiles);
  // Add some critical files to ensure the logic path is fully covered
  changedFiles.push({ path: "/etc/shadow", hash: "new-hash", mtime: new Date().toISOString() });
  changedFiles.push({ path: "/home/user/.ssh/authorized_keys", hash: "new-hash", mtime: new Date().toISOString() });

  (mockSidecar.sendCommand as any) = async () => ({ processes: [], files: changedFiles });

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await service.checkDrift();
    const end = performance.now();
    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Average execution time over ${iterations} iterations: ${avg.toFixed(4)}ms`);
  return avg;
}

if (import.meta.main) {
  await runBenchmark(100);
  await runBenchmark(1000);
  await runBenchmark(10000);
}
