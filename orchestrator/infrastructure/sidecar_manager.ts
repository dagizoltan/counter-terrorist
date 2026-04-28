import { isAllowedSidecar, SidecarResponse } from "./validation.ts";
import { SystemExecutor } from "./system_executor.ts";
import { CommandResult } from "./command_manager.ts";

/**
 * Manages persistent Rust sidecars.
 */
export class SidecarManager {
  private persistentProcesses: Map<string, Deno.ChildProcess> = new Map();
  private responseWaiters: Map<string, Map<string, { resolve: (data: SidecarResponse) => void, reject: (err: Error) => void }>> = new Map();
  private eventHandlers: Map<string, ((data: any) => void)[]> = new Map();

  constructor(private executor: SystemExecutor) {}

  async runSidecar(name: string, args: string[] = []): Promise<CommandResult> {
    if (!isAllowedSidecar(name)) {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar '${name}' is not in the allowlist.`,
      };
    }

    const PERSISTENT_SIDECARS = ["scanner", "honeypot", "pcap", "ebpf"];
    if (PERSISTENT_SIDECARS.includes(name)) {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar '${name}' is a persistent daemon. Use getPersistentSidecar() instead.`,
      };
    }

    const binPath = await this.findBinary(name);
    if (!binPath) {
      return {
        success: false,
        stdout: "",
        stderr: `Sidecar binary '${name}' not found in agents/target/`,
      };
    }

    return this.executor.execute(binPath, args);
  }

  async getPersistentSidecar(name: string): Promise<Deno.ChildProcess | null> {
    if (!isAllowedSidecar(name)) {
      throw new Error(`Sidecar '${name}' is not in the allowlist.`);
    }

    if (this.persistentProcesses.has(name)) {
      return this.persistentProcesses.get(name)!;
    }

    const binPath = await this.findBinary(name);
    if (!binPath) return null;

    const command = new Deno.Command(binPath, {
      stdin: "piped",
      stdout: "piped",
      stderr: "piped",
    });

    const child = command.spawn();
    console.log(`[SIDE-MAN] Spawned persistent sidecar: ${name}`);

    child.status.then((status) => {
      console.warn(`[SIDE-MAN] Sidecar ${name} exited with code ${status.code}.`);
      this.persistentProcesses.delete(name);
    });

    // Handle stderr
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
        // ignore
      } finally {
        reader.releaseLock();
      }
    })();

    this.persistentProcesses.set(name, child);
    this.startResponseReader(name, child);
    return child;
  }

  private async findBinary(name: string): Promise<string | null> {
    const isWindows = Deno.build.os === "windows";
    const extension = isWindows ? ".exe" : "";
    const paths = [
      `./agents/target/release/${name}${extension}`,
      `./agents/target/debug/${name}${extension}`,
    ];

    for (const p of paths) {
      try {
        const info = await Deno.stat(p);
        if (info.isFile) return p;
      } catch {
        continue;
      }
    }
    return null;
  }

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
            const data = JSON.parse(line) as SidecarResponse;

            if (data.id && this.responseWaiters.has(name)) {
              const waiters = this.responseWaiters.get(name)!;
              const waiter = waiters.get(data.id);
              if (waiter) {
                waiter.resolve(data);
                waiters.delete(data.id);
                continue;
              }
            }

            const handlers = this.eventHandlers.get(name) || [];
            for (const handler of handlers) {
              handler(data);
            }
          } catch {
            console.error(`[SIDE-MAN:${name}] Failed to parse response: ${line}`);
          }
        }
      }
    } catch (e) {
      console.error(`[SIDE-MAN:${name}] Reader error:`, e);
    } finally {
      reader.releaseLock();
      this.persistentProcesses.delete(name);

      if (this.responseWaiters.has(name)) {
        const waiters = this.responseWaiters.get(name)!;
        for (const [_, waiter] of waiters.entries()) {
          waiter.reject(new Error(`Sidecar ${name} terminated`));
        }
      }
      this.responseWaiters.delete(name);
    }
  }

  async sendCommand(name: string, cmd: string | object): Promise<SidecarResponse> {
    const child = await this.getPersistentSidecar(name);
    if (!child) throw new Error(`Sidecar ${name} not found`);

    const id = crypto.randomUUID();
    let commandObj: any;
    if (typeof cmd === "string") {
      commandObj = { id, type: cmd };
    } else {
      commandObj = { ...cmd, id };
    }

    const responsePromise = new Promise<SidecarResponse>((resolve, reject) => {
      if (!this.responseWaiters.has(name)) {
        this.responseWaiters.set(name, new Map());
      }
      this.responseWaiters.get(name)!.set(id, { resolve, reject });
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        if (this.responseWaiters.has(name)) {
          this.responseWaiters.get(name)!.delete(id);
        }
        reject(new Error(`Command ${commandObj.type} to ${name} timed out`));
      }, 30000);
    });

    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(JSON.stringify(commandObj) + "\n"));
    writer.releaseLock();

    return Promise.race([responsePromise, timeoutPromise]);
  }

  onEvent(name: string, handler: (data: any) => void) {
    if (!this.eventHandlers.has(name)) {
      this.eventHandlers.set(name, []);
    }
    this.eventHandlers.get(name)!.push(handler);
  }
}
