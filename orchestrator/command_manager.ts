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
  private responseWaiters: Map<string, Map<string, (data: any) => void>> = new Map();
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();

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
    this.startResponseReader(name, child);
    return child;
  }

  /**
   * Starts a background reader for a sidecar's stdout to handle multiplexed JSON responses.
   */
  private async startResponseReader(name: string, child: Deno.ChildProcess) {
    const reader = child.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            // 1. Check if anyone is waiting for this specific ID
            if (data.id && this.responseWaiters.has(name)) {
              const waiters = this.responseWaiters.get(name)!;
              const resolve = waiters.get(data.id);
              if (resolve) {
                resolve(data);
                waiters.delete(data.id);
                continue;
              }
            }

            // 2. Otherwise, treat as a generic background event
            const handlers = this.eventHandlers.get(name) || [];
            for (const handler of handlers) {
              handler(data);
            }
          } catch {
            console.error(`[COMMAND:${name}] Failed to parse sidecar response: ${line}`);
          }
        }
      }
    } catch (e) {
      console.error(`[COMMAND:${name}] Reader error:`, e);
    } finally {
      reader.releaseLock();
      this.persistentProcesses.delete(name);
      this.responseWaiters.delete(name);
    }
  }

  /**
   * Sends a command to a persistent sidecar and waits for a response with a matching ID.
   */
  async sendCommand(name: string, cmd: string | object): Promise<any> {
    const child = await this.getPersistentSidecar(name);
    if (!child) throw new Error(`Sidecar ${name} not found`);

    const id = crypto.randomUUID();
    let commandObj: any;

    if (typeof cmd === "string") {
      commandObj = { id, type: cmd };
    } else {
      commandObj = { ...cmd, id };
    }

    const responsePromise = new Promise((resolve) => {
      if (!this.responseWaiters.has(name)) {
        this.responseWaiters.set(name, new Map());
      }
      this.responseWaiters.get(name)!.set(id, resolve);
    });

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(commandObj) + "\n"));
    writer.releaseLock();

    return responsePromise;
  }

  /**
   * Registers a handler for background events from a sidecar.
   */
  onEvent(name: string, handler: (data: any) => void) {
    if (!this.eventHandlers.has(name)) {
      this.eventHandlers.set(name, []);
    }
    this.eventHandlers.get(name)!.push(handler);
  }
}

export const commandManager = new CommandManager();
