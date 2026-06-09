import { SidecarManager } from "@infrastructure/runtime/sidecar_manager.ts";
import { SystemLifecycleService } from "@domain/analysis/system_lifecycle_service.ts";
import { ServiceRegistry } from "@core/registry.ts";
import { loggingService } from "@infrastructure/system/logging.ts";
import { LogType, LogSeverity } from "@core/ports.ts";

export class LifecycleManager {
    constructor(
        private lifecycleService: SystemLifecycleService,
        private sidecarManager: SidecarManager,
        private _registry: ServiceRegistry,
        private emergencyLockdownDelegate: (reason: string) => Promise<void>,
        private config?: import("../core/ports/system.ts").ConfigurationPort
    ) {}

    async setupSafetyAndErrorHandlers() {
        const isSafeMode = await this.lifecycleService.checkCrashLoop();
        if (isSafeMode) {
             Deno.env.set("SHADOW_MODE", "true");
             Deno.env.set("STRICT_POLICY_ENFORCEMENT", "false");
             loggingService.log({
                 timestamp: new Date().toISOString(),
                 type: LogType.AUDIT,
                 severity: LogSeverity.ERROR,
                 caller: "orchestrator:app:lifecycle_manager",
                 message: "⚠️ SAFE MODE ACTIVATED: Multiple boot failures detected. All enforcement disabled."
             });

             if (this.config?.getEnv("AUTO_RESTORE_LKG") === "true") {
                 await this.lifecycleService.tryRestoreLkg();
             }
        }

        globalThis.addEventListener("unhandledrejection", (e) => {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "RUNTIME",
                message: `Unhandled Promise Rejection: ${e.reason}. Initiating fail-closed sequence.`
            }).catch(err => console.error(`Background task failure: ${err}`));

            this.emergencyLockdownDelegate(`Unhandled Promise Rejection: ${e.reason}`);
        });

        globalThis.addEventListener("error", (e) => {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "RUNTIME",
                message: `Fatal Runtime Error: ${e.message}. Initiating fail-closed sequence.`
            }).catch(err => console.error(`Background task failure: ${err}`));

            this.emergencyLockdownDelegate(`Fatal Runtime Error: ${e.message}`);
        });
    }

    wireEvents() {
        this.sidecarManager.onEvent("SYSTEM_ERROR", (payload) => {
            const eventPayload = payload as { type?: string; critical?: boolean; sidecar?: string };
            if (eventPayload.type === "SIDECAR_CRASH_LOOP" && eventPayload.critical) {
                loggingService.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.AUDIT,
                    severity: LogSeverity.ERROR,
                    caller: "orchestrator:app:lifecycle_manager:fail_closed",
                    message: `FATAL: Critical sidecar '${eventPayload.sidecar ?? "unknown"}' entered crash loop. Initiating emergency lockdown.`
                }).catch(err => console.error(`Background task failure: ${err}`));

                this.emergencyLockdownDelegate(`Critical Sidecar Failure: ${eventPayload.sidecar ?? "unknown"}`);
            }
        });
    }

    registerSignalHandlers(shutdownHandler: () => Promise<void>) {
        this.lifecycleService.registerSignalHandlers(shutdownHandler);
    }
}
