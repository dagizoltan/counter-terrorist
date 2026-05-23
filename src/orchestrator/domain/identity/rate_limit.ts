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

  constructor(private kv: Deno.Kv) {
      super();
  }

  protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
    return { success: true, data: undefined };
  }

  protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
    return ok(undefined);
  }

  /**
   * Increments and checks the rate limit for a given key (e.g., IP).
   * @param key The identifier to rate limit (IP, User ID, etc.)
   * @param limit Maximum number of requests allowed in the window.
   * @param windowMs The time window in milliseconds.
   */
  async checkLimit(key: string, limit: number, windowMs: number): Promise<RateLimitStatus> {
    const fullKey = [...this.PREFIX, key];
    const now = Date.now();

    const result = await retry(async () => {
      const entry = await this.kv.get<{ count: number; resetAt: number }>(fullKey);
      let state = entry.value || { count: 0, resetAt: now + windowMs };

      if (now > state.resetAt) {
        state = { count: 1, resetAt: now + windowMs };
      } else {
        state.count++;
      }

      const res = await this.kv.atomic()
        .check(entry)
        .set(fullKey, state, { expireIn: windowMs })
        .commit();
      
      if (!res.ok) throw new Error("KV contention");

      const allowed = state.count <= limit;
      const retryAfterMs = Math.max(0, state.resetAt - now);

      if (!allowed) {
        loggingService.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "SECURITY:RATELIMIT",
            message: `RATE_LIMIT_EXCEEDED: Key=${key}, Count=${state.count}`
        });
      }

      return {
        allowed,
        count: state.count,
        resetAt: state.resetAt,
        retryAfterMs
      };
    }, { maxAttempts: 5, baseDelayMs: 10 });

    if (result.success) return result.data;
    throw new ResourceExhaustedError(`Rate limit state update failed after 5 attempts due to high contention.`, { key });
  }
}
