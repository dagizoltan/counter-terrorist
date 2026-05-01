import { CommandResult } from "@core/ports.ts";

/**
 * Executes one-off system commands.
 */
export class SystemExecutor {
  private static readonly WHITELISTED_COMMANDS = [
    "clamscan", "mkdir", "mv", "chmod", "ls", "sha256sum", "bash", "systemctl",
    "crontab", "which", "where", "powershell", "netsh", "taskkill", "tc", "kill",
    "cp", "gcore", "ufw", "tpm2_nvdefine", "tpm2_nvwrite", "tpm2_nvread",
    "tpm2_pcrread", "wg-quick", "wg", "launchctl", "system_profiler", "ss", "cargo",
    "unshare", "iptables"
  ];

  async executeAsync(cmd: string, args: string[] = []): Promise<void> {
    if (!SystemExecutor.WHITELISTED_COMMANDS.includes(cmd)) {
        throw new Error(`Security Violation: Command '${cmd}' is not in the system whitelist.`);
    }
    const command = new Deno.Command(cmd, {
        args,
        stdout: "null",
        stderr: "null",
    });
    const child = command.spawn();
    child.unref();
  }

  async execute(cmd: string, args: string[] = [], timeoutMs: number = 30000): Promise<CommandResult> {
    // Security: Whitelist validation
    if (!SystemExecutor.WHITELISTED_COMMANDS.includes(cmd)) {
        return {
            success: false,
            stdout: "",
            stderr: `Security Violation: Command '${cmd}' is not in the system whitelist.`,
        };
    }

    let timeoutId: number | undefined;
    let child: Deno.ChildProcess | undefined;

    try {
      const command = new Deno.Command(cmd, {
        args,
        stdout: "piped",
        stderr: "piped",
      });

      child = command.spawn();

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          if (child) {
            try {
              child.kill();
            } catch {
              // Ignore
            }
          }
          reject(new Error(`Command '${cmd} ${args.join(" ")}' timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });

      const result = await Promise.race([
        child.output(),
        timeoutPromise
      ]);

      if (timeoutId) clearTimeout(timeoutId);

      const { code, stdout, stderr } = result;
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
      if (timeoutId) clearTimeout(timeoutId);
      return {
        success: false,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
