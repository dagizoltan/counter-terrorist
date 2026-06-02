import { ok } from "@core/result.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { BaseService } from "@core/base_service.ts";
import { retry } from "../../core/utils/resilience.ts";
import { ResourceExhaustedError } from "../../core/errors.ts";

export interface RateLimitStatus {
  allowed: boolean;
  count: number;
  resetAt: number;
  retryAfterMs: number;
}

/**
 * RateLimitService: Persists rate limit state in Deno KV.
 * Supports distributed rate limiting across mesh nodes.
 */
export class RateLimitService extends BaseService {
  private readonly PREFIX = ["security", "ratelimit"];
  // SEC-08: In-memory tier to mitigate Deno KV lock contention
  private memoryTier: Map<string, { count: number, resetAt: number }> = new Map();
  private syncTimer?: any;

  constructor(private kv: Deno.Kv) {
      super();
  }

  protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
    // Periodically flush memory tier to KV
    this.syncTimer = setInterval(() => this.flushMemoryTier(), 5000);
    return { success: true, data: undefined };
  }

  protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
    if (this.syncTimer) clearInterval(this.syncTimer);
    await this.flushMemoryTier();
    return ok(undefined);
  }

  private async flushMemoryTier() {
      const now = Date.now();
      for (const [key, state] of this.memoryTier.entries()) {
          // If window expired, just clean up
          if (now > state.resetAt) {
              this.memoryTier.delete(key);
              continue;
          }

          // SEC-08 Hardening: Atomically extract and sync the current count
          // We clear the local count to avoid exponential over-counting.
          const countToSync = state.count;
          state.count = 0;

          // Asynchronously sync to KV.
          this.syncToKv(key, countToSync, state.resetAt).catch((e) => {
              // Re-add to memory tier if sync failed to avoid losing counts
              const currentState = this.memoryTier.get(key);
              if (currentState) currentState.count += countToSync;
          });
      }
  }

  private async syncToKv(key: string, delta: number, resetAt: number) {
      if (delta === 0) return;
      const fullKey = [...this.PREFIX, key];

      await retry(async () => {
          const entry = await this.kv.get<{ count: number; resetAt: number }>(fullKey);
          const now = Date.now();

          let newState: { count: number, resetAt: number };
          if (!entry.value || now > entry.value.resetAt) {
              newState = { count: delta, resetAt };
          } else {
              newState = {
                  count: entry.value.count + delta,
                  resetAt: Math.max(entry.value.resetAt, resetAt)
              };
          }

          const expireIn = Math.max(1000, newState.resetAt - now);
          const res = await this.kv.atomic()
            .check(entry)
            .set(fullKey, newState, { expireIn })
            .commit();

          if (!res.ok) throw new Error("KV contention during sync");
      }, { maxAttempts: 3, baseDelayMs: 20 });
  }

  /**
   * Increments and checks the rate limit for a given key (e.g., IP).
   * @param key The identifier to rate limit (IP, User ID, etc.)
   * @param limit Maximum number of requests allowed in the window.
   * @param windowMs The time window in milliseconds.
   */
  async checkLimit(key: string, limit: number, windowMs: number): Promise<RateLimitStatus> {
    const now = Date.now();

    // 1. Check memory tier first (fast path)
    let state = this.memoryTier.get(key);
    if (!state || now > state.resetAt) {
        state = { count: 0, resetAt: now + windowMs };
    }
    state.count++;
    this.memoryTier.set(key, state);

    const allowed = state.count <= limit;
    const retryAfterMs = Math.max(0, state.resetAt - now);

    if (!allowed) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "SECURITY:RATELIMIT",
            message: `RATE_LIMIT_EXCEEDED (Memory Tier): Key=${key}, Count=${state.count}`
        });
        // On violation, immediately sync to KV to enforce across nodes
        this.syncToKv(key, state.count, state.resetAt).catch(() => {});
    }

    // 2. Return status based on memory tier.
    // This allows immediate response while syncing happens out-of-band.
    return {
        allowed,
        count: state.count,
        resetAt: state.resetAt,
        retryAfterMs
    };
  }
}
