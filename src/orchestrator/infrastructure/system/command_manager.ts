import { CommandResult } from "@core/ports.ts";

export interface CommandManager {
  execute(cmd: string, args: string[]): Promise<CommandResult>;
}

export class SystemCommandManager implements CommandManager {
  async execute(cmd: string, args: string[]): Promise<CommandResult> {
    try {
      const command = new Deno.Command(cmd, {
        args: args,
        stdout: "piped",
        stderr: "piped",
      });
      const { success, stdout, stderr } = await command.output();
      return {
        success,
        stdout: new TextDecoder().decode(stdout),
        stderr: new TextDecoder().decode(stderr),
      };
    } catch (e) {
      return {
        success: false,
        stdout: "",
        stderr: (e as Error).message,
      };
    }
  }
}
