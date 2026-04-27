/**
 * Command Manager for executing Rust sidecars and other system commands.
 */

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  data?: any; // Parsed JSON if applicable
}

export class CommandManager {
  private persistentProcesses: Map<string, Deno.ChildProcess> = new Map();
  private commandLocks: Map<string, Promise<void>> = new Map();

  /**
   * Executes a command and returns the result.
   */
  async execute(cmd: string, args: string[] = []): Promise<CommandResult> {
    try {
      const command = new Deno.Command(cmd, {
        args,
        stdout: "piped",
        stderr: "piped",
      });

      const { code, stdout, stderr } = await command.output();
      const stdoutStr = new TextDecoder().decode(stdout);
      const stderrStr = new TextDecoder().decode(stderr);

      let data;
      if (stdoutStr.trim().startsWith("{") || stdoutStr.trim().startsWith("[")) {
        try {
          data = JSON.parse(stdoutStr);
        } catch {
          // Not valid JSON
        }
      }

      return {
        success: code === 0,
        stdout: stdoutStr,
        stderr: stderrStr,
        data,
      };
    } catch (error) {
      return {
        success: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Specifically handles execution of internal Rust sidecars.
   */
  async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    // Strict sidecar allowlist (Milestone 1 requirement)
    const ALLOWED_SIDECARS = ["scanner", "blocker"];
    if (!ALLOWED_SIDECARS.includes(name)) {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar '${name}' is not in the allowlist.`,
      };
    }

    // Protection against misuse: scanner is a persistent daemon and should not be run via runSidecar
    if (name === "scanner") {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar 'scanner' is a persistent daemon. Use sendCommand() instead.`,
      };
    }

    const isWindows = Deno.build.os === "windows";
    const extension = isWindows ? ".exe" : "";

    // Check both release and debug directories
    const paths = [
      `./agents/target/release/${name}${extension}`,
      `./agents/target/debug/${name}${extension}`,
    ];

    for (const binPath of paths) {
      try {
        const info = await Deno.stat(binPath);
        if (info.isFile) {
          return this.execute(binPath, args);
        }
      } catch {
        continue;
      }
    }

    return {
      success: false,
      stdout: "",
      stderr: `Sidecar binary '${name}' not found in agents/target/`,
    };
  }

  /**
   * Gets or starts a persistent sidecar process.
   */
  async getPersistentSidecar(name: string): Promise<Deno.ChildProcess | null> {
    if (this.persistentProcesses.has(name)) {
      return this.persistentProcesses.get(name)!;
    }

    const isWindows = Deno.build.os === "windows";
    const extension = isWindows ? ".exe" : "";
    const paths = [
      `./agents/target/release/${name}${extension}`,
      `./agents/target/debug/${name}${extension}`,
    ];

    let binPath = "";
    for (const p of paths) {
      try {
        const info = await Deno.stat(p);
        if (info.isFile) {
          binPath = p;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!binPath) return null;

    const command = new Deno.Command(binPath, {
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const child = command.spawn();
    console.log(`[COMMAND] Spawned persistent sidecar: ${name}`);

    // Monitor for exit to allow auto-restart on next use
    child.status.then((status) => {
      console.warn(`[COMMAND] Sidecar ${name} exited with code ${status.code}.`);
      this.persistentProcesses.delete(name);
    });

    // Background task to consume stderr to prevent the process from hanging
    (async () => {
      const reader = child.stderr.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const msg = new TextDecoder().decode(value);
            console.error(`[SIDECAR:${name}] ${msg.trim()}`);
          }
        }
      } catch {
        // Handle error if needed
      } finally {
        reader.releaseLock();
      }
    })();

    this.persistentProcesses.set(name, child);
    return child;
  }

  /**
   * Sends a command to a persistent sidecar and waits for a single line response.
   * Uses a lock to ensure thread-safe access to the process streams.
   */
  async sendCommand(name: string, cmd: string): Promise<any> {
    const lock = this.commandLocks.get(name) || Promise.resolve();
    let resolveLock: () => void;
    const newLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.commandLocks.set(name, newLock);

    try {
      await lock;
      const child = await this.getPersistentSidecar(name);
      if (!child) throw new Error(`Sidecar ${name} not found`);

      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(cmd + "\n"));
      writer.releaseLock();

      const reader = child.stdout.getReader();
      const decoder = new TextDecoder();
      let response = "";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          response += decoder.decode(value);
          if (response.endsWith("\n")) break;
        }
      } finally {
        reader.releaseLock();
      }

      if (!response) return null;
      try {
        return JSON.parse(response.trim());
      } catch {
        return response.trim();
      }
    } finally {
      resolveLock!();
    }
  }
}

export const commandManager = new CommandManager();
