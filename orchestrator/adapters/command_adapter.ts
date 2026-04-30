import { CommandPort, CommandResult } from "../core/ports.ts";
import { SidecarManager } from "../infrastructure/sidecar_manager.ts";

export class CommandAdapter implements CommandPort {
  constructor(private manager: SidecarManager) {}
  async sendCommand(sidecar: string, command: any): Promise<any> {
    return await this.manager.sendCommand(sidecar, command);
  }

  onEvent(sidecar: string, handler: (event: any) => void): void {
    this.manager.onEvent(sidecar, handler);
  }

  emitEvent(sidecar: string, event: any): void {
    this.manager.emitEvent(sidecar, event);
  }

  async getPersistentSidecar(sidecar: string): Promise<any> {
    return await this.manager.getPersistentSidecar(sidecar);
  }
}

