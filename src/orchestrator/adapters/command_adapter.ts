import { CommandPort, CommandResult } from "@core/ports.ts";
import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";

export class CommandAdapter implements CommandPort {
  constructor(private manager: SidecarManager) {}
  async sendCommand(sidecar: string, command: any): Promise<CommandResult> {
    const response = await this.manager.sendCommand(sidecar, command);
    return {
      success: response.success,
      stdout: JSON.stringify(response.data || {}),
      stderr: response.error || "",
      data: response.data
    };
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

  async restartSidecar(sidecar: string): Promise<void> {
    await this.manager.restartSidecar(sidecar);
  }

  async stopSidecar(sidecar: string): Promise<void> {
    await this.manager.stopSidecar(sidecar);
  }
}

