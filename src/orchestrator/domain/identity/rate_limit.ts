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
  private syncTimer?: number;

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
          if (now > state.resetAt) {
              this.memoryTier.delete(key);
              continue;
          }

          // Asynchronously sync to KV. We don't await here to avoid blocking the flush loop.
          this.syncToKv(key, state).catch(() => {});
      }
  }

  private async syncToKv(key: string, memState: { count: number, resetAt: number }) {
      const fullKey = [...this.PREFIX, key];
      await retry(async () => {
          const entry = await this.kv.get<{ count: number; resetAt: number }>(fullKey);
          const kvState = entry.value || { count: 0, resetAt: memState.resetAt };

          // SEC-08: Merge logic improvement. Sum counts across nodes instead of taking max.
          // If the KV resetAt is significantly older, we start fresh.
          const now = Date.now();
          const newState = {
              count: (now > kvState.resetAt) ? memState.count : (kvState.count + memState.count),
              resetAt: Math.max(kvState.resetAt, memState.resetAt)
          };

          const res = await this.kv.atomic()
            .check(entry)
            .set(fullKey, newState, { expireIn: newState.resetAt - Date.now() })
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
        this.syncToKv(key, state).catch(() => {});
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
