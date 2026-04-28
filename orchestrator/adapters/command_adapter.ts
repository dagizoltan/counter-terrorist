import { CommandPort, CommandResult } from "../core/ports.ts";
import { commandManager } from "../services/command_manager.ts";

export class CommandAdapter implements CommandPort {
  async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
    return await commandManager.sendCommand(sidecar, command);
  }

  onEvent(sidecar: string, handler: (event: any) => void): void {
    commandManager.onEvent(sidecar, handler);
  }

  async getPersistentSidecar(sidecar: string): Promise<any> {
    return await commandManager.getPersistentSidecar(sidecar);
  }
}

export const commandAdapter = new CommandAdapter();
