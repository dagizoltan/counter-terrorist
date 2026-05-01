/**
 * Shadow Watchdog
 * Monitors a target PID and restarts the orchestrator if it dies.
 */
const targetPid = parseInt(Deno.args[0]);

if (isNaN(targetPid)) {
  console.error("Watchdog: No target PID specified.");
  Deno.exit(1);
}

console.log(`[WATCHDOG] Monitoring PID ${targetPid}...`);

function isProcessRunning(pid: number): boolean {
  try {
    Deno.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

async function resurrect() {
  console.log("[WATCHDOG] Target PID lost. Resurrecting Orchestrator...");
  
  // In a real environment, we'd use the full path to the orchestrator binary
  // or the 'deno run' command used to start it.
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/orchestrator/main.ts"],
    stdout: "inherit",
    stderr: "inherit",
    unref: true,
  });

  cmd.spawn();
}

// Polling loop
setInterval(() => {
  if (!isProcessRunning(targetPid)) {
    resurrect();
    // Once resurrected, this watchdog can exit, as the new orchestrator will spawn its own watchdog.
    Deno.exit(0);
  }
}, 2000);
