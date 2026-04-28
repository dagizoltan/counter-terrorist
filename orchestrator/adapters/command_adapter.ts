import { CommandPort, CommandResult } from "../core/ports.ts";
import { CommandManager } from "../infrastructure/command_manager.ts";

export class CommandAdapter implements CommandPort {
  constructor(private manager: CommandManager) {}
  async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
    return await this.manager.sendCommand(sidecar, command);
  }

  onEvent(sidecar: string, handler: (event: any) => void): void {
    this.manager.onEvent(sidecar, handler);
  }

  async getPersistentSidecar(sidecar: string): Promise<any> {
    return await this.manager.getPersistentSidecar(sidecar);
  }
}

