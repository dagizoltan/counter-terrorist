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
    // Assuming binaries are in ./agents/target/release/ or similar
    // For development, we might look for them in different places
    const binPath = `./agents/target/debug/${name}`;
    return this.execute(binPath, args);
  }
}

export const commandManager = new CommandManager();
