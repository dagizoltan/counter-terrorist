import { Service } from "./base_service.ts";
import { LoggingPort, LogSeverity, LogType } from "./ports.ts";
import { Result, ok } from "./result.ts";

export enum ShutdownPriority {
    CRITICAL = 0,    // Logging, Audit, Health
    NETWORK = 1,     // Mesh, VPN
    AUXILIARY = 2,   // Plugins, Tactical Ingestors
    INTERFACE = 3    // Web UI, ViewModel
}

/**
 * ServiceRegistry
 * Centralizes the management of all active domain services.
 * Ensures ordered initialization and graceful, automated shutdown.
 */
export class ServiceRegistry {
    private services: Map<string, { service: Service, priority: ShutdownPriority }> = new Map();
    private initOrder: string[] = [];

    constructor(private logging?: LoggingPort) {}

    /**
     * Registers a service with the registry.
     */
    register(name: string, service: Service, priority: ShutdownPriority = ShutdownPriority.AUXILIARY) {
        const existing = this.services.get(name);
        if (existing) {
            if (existing.service !== service) {
                this.logging?.log({
                    timestamp: new Date().toISOString(),
                    type: LogType.GENERIC,
                    severity: LogSeverity.WARNING,
                    caller: "orchestrator:core:registry",
                    message: `Service '${name}' is already registered with a different instance. Overwriting.`
                });
            }
            this.services.set(name, { service, priority });
            return;
        }
        this.services.set(name, { service, priority });
        this.initOrder.push(name);
    }

    /**
     * Shuts down all registered services in reverse registration order.
     */
    async shutdownAll(): Promise<Result<void>> {
        this.logging?.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:core:registry",
            message: `Initiating automated shutdown for ${this.services.size} services...`
        });

        // 1. Group services by priority
        const prioritized = Array.from(this.services.entries())
            .sort((a, b) => b[1].priority - a[1].priority); // Highest priority index first

        for (const [name, { service }] of prioritized) {
            if (service && typeof service.shutdown === "function") {
                try {
                    await service.shutdown();
                    this.logging?.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.DEBUG,
                        severity: LogSeverity.INFO,
                        caller: "orchestrator:core:registry",
                        message: `Service '${name}' shut down successfully.`
                    });
                } catch (e) {
                    this.logging?.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:core:registry",
                        message: `Error shutting down service '${name}': ${(e as Error).message}`
                    });
                }
            }
        }

        this.services.clear();
        this.initOrder = [];
        return ok(undefined);
    }

    getService<T extends Service>(name: string): T | undefined {
        return this.services.get(name)?.service as T;
    }

    listServices(): string[] {
        return Array.from(this.services.keys());
    }

    /**
     * Initializes all services in the order they were registered.
     */
    async initAll(): Promise<Result<void>> {
        this.logging?.log({
            timestamp: new Date().toISOString(),
            type: LogType.ACTIVITY,
            severity: LogSeverity.INFO,
            caller: "orchestrator:core:registry",
            message: `Initiating automated startup for ${this.services.size} services...`
        });

        for (const name of this.initOrder) {
            const entry = this.services.get(name);
            const service = entry?.service;
            if (service && typeof service.init === "function") {
                try {
                    const res = await service.init();
                    if (!res.success) {
                        this.logging?.log({
                            timestamp: new Date().toISOString(),
                            type: LogType.GENERIC,
                            severity: LogSeverity.WARNING,
                            caller: "orchestrator:core:registry",
                            message: `Service '${name}' init non-critical failure: ${res.error.message}`
                        });
                    }
                } catch (e) {
                    this.logging?.log({
                        timestamp: new Date().toISOString(),
                        type: LogType.GENERIC,
                        severity: LogSeverity.ERROR,
                        caller: "orchestrator:core:registry",
                        message: `Critical error initializing service '${name}': ${(e as Error).message}`
                    });
                }
            }
        }
        return ok(undefined);
    }
}
