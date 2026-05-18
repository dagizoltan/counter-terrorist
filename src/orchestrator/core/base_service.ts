import { EventBus } from "@domain/analysis/events.ts";
import { Result, ok } from "./result.ts";

/**
 * Common interface for all Sovereign Services.
 * Enforces a standard lifecycle and communication pattern.
 */
export interface Service {
    init?(...args: any[]): Promise<Result<void>> | Result<void>;
    shutdown?(): Promise<Result<void>> | Result<void>;
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

    async init(): Promise<Result<void>> {
        return ok(undefined);
    }

    async shutdown(): Promise<Result<void>> {
        return ok(undefined);
    }
}
