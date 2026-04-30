import { BaselineService, ProcessSnapshot, SystemSnapshot } from "@services/forensics/baseline.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";
import { LoggingPort, SyslogSeverity } from "@core/ports.ts";

// Mock dependencies
const mockKv = {
  get: async () => ({ value: null }),
  set: async () => {},
} as any;

const mockSidecar = {
  sendCommand: async () => ({ processes: [] }),
} as unknown as SidecarManager;

const mockExecutor = {
  execute: async () => ({ stdout: "", stderr: "" }),
} as unknown as SystemExecutor;

const mockLogging = {
  log: async () => {},
} as unknown as LoggingPort;

function generateProcesses(count: number, offset: number = 0): ProcessSnapshot[] {
  const procs: ProcessSnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const id = i + offset;
    procs.push({
      pid: id,
      name: `proc-${id}`,
      exe_path: `/usr/bin/proc-${id}`,
      hash: `hash-${id}`,
      key: `/usr/bin/proc-${id}:hash-${id}`,
    });
  }
  return procs;
}

async function runBenchmark(numProcesses: number, iterations: number = 5) {
  console.log(`--- Benchmarking with ${numProcesses} processes ---`);

  const service = new BaselineService(mockKv, mockSidecar, mockExecutor, mockLogging);

  // Set initial baseline
  const baselineProcs = generateProcesses(numProcesses);
  (mockSidecar.sendCommand as any) = async () => ({ processes: baselineProcs });
  await service.setBaseline();

  // Prepare current processes: 90% same as baseline, 10% new
  const sameCount = Math.floor(numProcesses * 0.9);
  const newCount = numProcesses - sameCount;
  const currentProcs = [
    ...baselineProcs.slice(0, sameCount),
    ...generateProcesses(newCount, numProcesses), // Brand new processes
  ];

  // We need to run it twice to trigger the ephemeral filter (which uses previousProcesses)
  // First run: previousProcesses is null, newProcs becomes empty
  (mockSidecar.sendCommand as any) = async () => ({ processes: currentProcs });
  const result1 = await service.checkDrift();
  console.log(`First run: detected ${result1?.newProcs.length} new processes (Expected 0 due to ephemeral filter)`);

  // Second run: previousProcesses is now populated from first run
  // We'll keep the processes the same as first run so they are NOT ephemeral
  const result2 = await service.checkDrift();
  console.log(`Second run: detected ${result2?.newProcs.length} new processes (Expected ${newCount})`);

  const times: number[] = [];
  // Suppress logs for benchmarking
  const originalWarn = console.warn;
  console.warn = () => {};
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await service.checkDrift();
    const end = performance.now();
    times.push(end - start);
  }
  console.warn = originalWarn;

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(`Average execution time over ${iterations} iterations: ${avg.toFixed(4)}ms`);
  return avg;
}

await runBenchmark(100);
await runBenchmark(1000);
await runBenchmark(5000);
