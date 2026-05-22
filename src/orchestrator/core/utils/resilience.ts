import { Result, ok, err } from "../result.ts";

export interface CircuitBreakerOptions {
    failureThreshold: number;
    resetTimeoutMs: number;
}

export enum CircuitState {
    CLOSED, // Normal operation, allowing requests
    OPEN,   // Failing, blocking requests
    HALF_OPEN // Testing if the service has recovered
}

/**
 * CircuitBreaker
 * Prevents cascading failures by stopping requests to failing external services.
 */
export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private failureCount: number = 0;
    private lastFailureTime?: number;

    constructor(private options: CircuitBreakerOptions = { failureThreshold: 5, resetTimeoutMs: 60000 }) {}

    async execute<T>(action: () => Promise<T>): Promise<Result<T>> {
        if (this.state === CircuitState.OPEN) {
            const now = Date.now();
            if (now - (this.lastFailureTime || 0) > this.options.resetTimeoutMs) {
                this.state = CircuitState.HALF_OPEN;
            } else {
                return err(new Error("Circuit breaker is OPEN. Request rejected for stability."));
            }
        }

        try {
            const result = await action();
            this.onSuccess();
            return ok(result);
        } catch (e) {
            this.onFailure();
            return err(e instanceof Error ? e : new Error(String(e)));
        }
    }

    private onSuccess() {
        this.failureCount = 0;
        this.state = CircuitState.CLOSED;
    }

    private onFailure() {
        this.failureCount++;
        this.lastFailureTime = Date.now();
        if (this.failureCount >= this.options.failureThreshold) {
            this.state = CircuitState.OPEN;
        }
    }

    getState(): CircuitState {
        return this.state;
    }
}
