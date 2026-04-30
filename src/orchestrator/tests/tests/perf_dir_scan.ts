import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemExecutor } from "@infrastructure/system/system_executor.ts";

const executor = new SystemExecutor();
const sidecarManager = new SidecarManager(executor);

async function benchmarkDirScan(paths: string[], iterations: number = 5) {
  console.log(`Benchmarking DIR_SCAN with paths: ${paths.join(", ")}`);

  // Warm up
  try {
    await sidecarManager.sendCommand("scanner", { type: "DIR_SCAN", paths });
  } catch (e) {
    console.error("Warmup failed:", e);
  }

  const singleCommandTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await sidecarManager.sendCommand("scanner", { type: "DIR_SCAN", paths });
    singleCommandTimes.push(performance.now() - start);
  }

  const multiCommandTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    for (const path of paths) {
      await sidecarManager.sendCommand("scanner", { type: "DIR_SCAN", path });
    }
    multiCommandTimes.push(performance.now() - start);
  }

  const avgSingle = singleCommandTimes.reduce((a, b) => a + b, 0) / iterations;
  const avgMulti = multiCommandTimes.reduce((a, b) => a + b, 0) / iterations;

  console.log(`Average Single Command (optimized): ${avgSingle.toFixed(2)}ms`);
  console.log(`Average Multi Command (N+1): ${avgMulti.toFixed(2)}ms`);
  console.log(`Improvement: ${(((avgMulti - avgSingle) / avgMulti) * 100).toFixed(2)}%`);
}

if (import.meta.main) {
  // Use some directories that are likely to exist and have some files
  const testPaths = ["/etc", "/usr/bin", "/var/log"];
  await benchmarkDirScan(testPaths);

  // Cleanup
  Deno.exit(0);
}
