import { SidecarManager } from "./sidecar_manager.ts";
import { SystemExecutor } from "../system/system_executor.ts";

/**
 * Manages command routing and sidecar interactions.
 * Alias for SidecarManager to maintain compatibility with Milestone 1 tests and references.
 */
export class CommandManager extends SidecarManager {
    constructor() {
        super(new SystemExecutor());
    }
}

export const commandManager = new CommandManager();
export type { CommandResult } from "../core/ports.ts";
