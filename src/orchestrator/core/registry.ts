import { Service } from "./base_service.ts";
import { LoggingPort, LogSeverity, LogType } from "./ports.ts";
import { Result, ok } from "./result.ts";

/**
 * ServiceRegistry
 * Centralizes the management of all active domain services.
 * Ensures ordered initialization and graceful, automated shutdown.
 */
export class ServiceRegistry {
    private services: Map<string, Service> = new Map();
    private initOrder: string[] = [];

    constructor(private logging?: LoggingPort) {}

    /**
     * Registers a service with the registry.
     */
    register(name: string, service: Service) {
        if (this.services.has(name)) {
            this.logging?.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.WARNING,
                caller: "orchestrator:core:registry",
                message: `Service '${name}' is already registered. Overwriting.`
            });
        }
        this.services.set(name, service);
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

        // Shutdown in reverse order of registration
        const names = [...this.initOrder].reverse();
        for (const name of names) {
            const service = this.services.get(name);
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
        return this.services.get(name) as T;
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
            const service = this.services.get(name);
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
