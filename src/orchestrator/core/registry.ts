/**
 * Service Registry
 * Centralized registry for core infrastructure and domain services.
 * Helps eliminate circular dependencies and facilitates decoupled boot sequences.
 */

import { LoggingPort, CommandPort } from "../core/ports.ts";

export class ServiceRegistry {
    private static services: Map<string, any> = new Map();

    static register<T>(name: string, service: T): T {
        this.services.set(name, service);
        return service;
    }

    static get<T>(name: string): T {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`ServiceRegistry: Service '${name}' not registered.`);
        }
        return service as T;
    }

    static has(name: string): boolean {
        return this.services.has(name);
    }

    // Convenience getters for core infra
    static get logging(): LoggingPort {
        return this.get<LoggingPort>("logging");
    }

    static get commands(): CommandPort {
        return this.get<CommandPort>("commands");
    }

    static get kv(): Deno.Kv {
        return this.get<Deno.Kv>("kv");
    }
}
