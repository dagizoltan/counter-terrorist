import { ok } from "@core/result.ts";
import { loggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";
import { BaseService } from "@core/base_service.ts";
import { retry } from "../../core/utils/resilience.ts";
import { ResourceExhaustedError } from "../../core/errors.ts";

interface RateLimitState {
  count: number;
  resetAt: number;
  /** How much of `count` has already been pushed to KV. */
  synced: number;
  /** The write currently in flight for this key, if any. */
  inflight: Promise<void> | null;
}

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
  // SEC-08: In-memory tier to mitigate Deno KV lock contention.
  //
  // `synced` is how much of `count` has already been pushed to KV, so a sync only ever
  // sends the delta. Pushing the running total on every request instead made the
  // persisted counter ~189x the real request count over a 500-request window, and issued
  // one KV transaction per request past the halfway mark — write amplification that
  // peaked exactly when the node was under flood.
  //
  // Note: the allow/deny decision is still taken purely from this node's own count. The
  // KV tier records the counts but is not read back, so the limit is per-node, not
  // mesh-wide, despite the class comment.
  private memoryTier: Map<string, RateLimitState> = new Map();
  private syncTimer?: any;

  constructor(private kv: Deno.Kv) {
      super();
  }

  protected override async onInit(): Promise<import("../../core/result.ts").Result<void>> {
    // Periodically flush memory tier to KV
    this.syncTimer = setInterval(() => { void this.flushMemoryTier(); }, 5000);
    return { success: true, data: undefined };
  }

  protected override async onShutdown(): Promise<import("../../core/result.ts").Result<void>> {
    if (this.syncTimer) clearInterval(this.syncTimer);
    await this.flushMemoryTier();
    return ok(undefined);
  }

  private async flushMemoryTier(): Promise<void> {
      const now = Date.now();
      const pending: Promise<void>[] = [];

      for (const [key, state] of this.memoryTier.entries()) {
          // If window expired, just clean up
          if (now > state.resetAt) {
              this.memoryTier.delete(key);
              continue;
          }

          // Push only what has not been pushed yet. `count` is left intact so the
          // in-window decision keeps seeing the true local total.
          pending.push((async () => {
              // Let any in-flight write settle first, then push whatever is still
              // outstanding. Without this, shutdown could return before the last counts
              // reached KV.
              await state.inflight?.catch(() => {});
              await this.syncKey(key, state);
          })());
      }

      await Promise.allSettled(pending);
  }

  /**
   * Pushes this key's unsynced delta to KV.
   *
   * Advances `synced` optimistically and rolls it back if the write ultimately fails, so
   * a failed sync loses no counts and a successful one is never counted twice.
   */
  private syncKey(key: string, state: RateLimitState): Promise<void> {
      // One in-flight write per key. Firing a fresh transaction on every request past the
      // threshold made concurrent atomics on the same key fight each other, so the
      // optimistic `.check` failed and counts were dropped once the retry budget ran out.
      // Whatever is missed here is picked up by the next threshold crossing or by the
      // periodic flush.
      if (state.inflight) return state.inflight;

      const delta = state.count - state.synced;
      if (delta <= 0) return Promise.resolve();

      state.synced = state.count;
      const write = this.syncToKv(key, delta, state.resetAt)
          .then(() => {})
          .catch(() => {
              // Give the delta back so it is retried, but only while this is still the
              // live state for the key: the window may have rolled over (or the entry may
              // have been evicted) while the write was in flight, and the replacement
              // state must not inherit the old window's counts.
              if (this.memoryTier.get(key) === state) {
                  state.synced = Math.max(0, state.synced - delta);
              }
          })
          .finally(() => {
              if (state.inflight === write) state.inflight = null;
          });

      state.inflight = write;
      return write;
  }

  /** Adds `delta` to the persisted counter for this key. */
  private async syncToKv(key: string, delta: number, resetAt: number): Promise<number> {
      if (delta === 0) return 0;
      const fullKey = [...this.PREFIX, key];

      return await retry(async () => {
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
          return newState.count;
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
        state = { count: 0, resetAt: now + windowMs, synced: 0, inflight: null };
    }
    state.count++;
    this.memoryTier.set(key, state);

    const allowed = state.count <= limit;
    const retryAfterMs = Math.max(0, state.resetAt - now);

    if (!allowed || state.count >= (limit / 2)) {
        if (!allowed) {
            loggingService.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "SECURITY:RATELIMIT",
                message: `RATE_LIMIT_EXCEEDED (Memory Tier): Key=${key}, Count=${state.count}`
            });
        }

        // SEC-08 Hardening: Threshold-Triggered Sync
        // If we reach 50% of the limit, or violate it, sync immediately to KV
        // to close the distributed bypass window. Fire-and-forget: the hot path must not
        // wait on KV.
        void this.syncKey(key, state);
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
