import { EventBus } from "@domain/analysis/events.ts";

/**
 * Common interface for all Sovereign Services.
 * Enforces a standard lifecycle and communication pattern.
 */
export interface Service {
    init?(...args: any[]): Promise<void> | void;
    shutdown?(): Promise<void> | void;
    setEventBus?(eventBus: EventBus): void;
}

/**
 * Optional Base class for services that provides default implementations.
 */
export abstract class BaseService implements Service {
    protected eventBus?: EventBus;

    setEventBus(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    async init(): Promise<void> {}
    async shutdown(): Promise<void> {}
}
