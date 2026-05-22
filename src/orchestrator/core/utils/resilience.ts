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
/**
 * RetryOptions
 */
export interface RetryOptions {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs?: number;
    factor?: number;
    onRetry?: (error: Error, attempt: number) => void;
}

/**
 * retry
 * Standardized exponential backoff retry logic.
 */
export async function retry<T>(
    action: () => Promise<T>,
    options: RetryOptions = { maxAttempts: 3, baseDelayMs: 1000 }
): Promise<Result<T>> {
    const factor = options.factor ?? 2;
    const maxDelay = options.maxDelayMs ?? 30000;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
        try {
            const data = await action();
            return ok(data);
        } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (attempt < options.maxAttempts) {
                options.onRetry?.(lastError, attempt);
                const delay = Math.min(maxDelay, options.baseDelayMs * Math.pow(factor, attempt - 1));
                const jitter = delay * 0.1 * Math.random();
                await new Promise(r => setTimeout(r, delay + jitter));
            }
        }
    }

    return err(lastError || new Error("Retry failed after max attempts"));
}

/**
 * withTimeout
 * Wraps an async operation with a forced timeout.
 */
export async function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMsg: string = "Operation timed out"
): Promise<T> {
    let timer: number | null = null;
    let timeoutReject: ((reason?: any) => void) | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutReject = reject;
        timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timer) {
            clearTimeout(timer);
            // Also reject the promise if it's still pending to avoid leaks in some runtimes
            // though race + clearTimeout usually handles it.
        }
    }
}

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
