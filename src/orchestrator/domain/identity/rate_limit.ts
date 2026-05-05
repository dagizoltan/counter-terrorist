import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";

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
export class RateLimitService {
  private readonly PREFIX = ["security", "ratelimit"];

  constructor(private kv: Deno.Kv) {}

  /**
   * Increments and checks the rate limit for a given key (e.g., IP).
   * @param key The identifier to rate limit (IP, User ID, etc.)
   * @param limit Maximum number of requests allowed in the window.
   * @param windowMs The time window in milliseconds.
   */
  async checkLimit(key: string, limit: number, windowMs: number): Promise<RateLimitStatus> {
    const fullKey = [...this.PREFIX, key];
    const now = Date.now();

    while (true) {
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
      
      if (res.ok) {
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
      }
      // If commit failed (optimistic locking), retry the loop.
    }
  }
}
