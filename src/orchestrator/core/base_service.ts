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
    protected initialized = false;
    protected initPromise: Promise<Result<void>> | null = null;

    setEventBus(eventBus: EventBus) {
        this.eventBus = eventBus;
    }

    /**
     * Standard initialization with re-entrancy protection.
     */
    async init(..._args: any[]): Promise<Result<void>> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                const res = await this.onInit(..._args);
                if (res.success) {
                    this.initialized = true;
                }
                return res;
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    /**
     * Override this for service-specific initialization logic.
     */
    protected async onInit(..._args: any[]): Promise<Result<void>> {
        return ok(undefined);
    }

    /**
     * Standard shutdown logic.
     */
    async shutdown(): Promise<Result<void>> {
        const res = await this.onShutdown();
        return res;
    }

    /**
     * Override this for service-specific shutdown logic.
     */
    protected async onShutdown(): Promise<Result<void>> {
        return ok(undefined);
    }

    /**
     * Guard that ensures the service is fully initialized before use.
     */
    protected ensureReady() {
        if (!this.initialized) {
            throw new Error(`Service ${this.constructor.name} is not initialized.`);
        }
    }
}
