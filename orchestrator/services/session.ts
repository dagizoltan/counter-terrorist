/**
 * Session Management Service.
 *
 * Manages ephemeral, revocable browser sessions stored in Deno KV.
 * Session IDs are random UUIDs — the raw API_TOKEN is never stored client-side.
 */

import { LoggingPort, SyslogSeverity } from "../core/ports.ts";
import { Role } from "./api_keys.ts";

export interface Session {
  createdAt: number;
  expiresAt: number;
  csrfToken: string;
  role: Role;
}

const SESSIONS_PREFIX = ["sessions"];

export class SessionService {
  private ttlMs: number;

  constructor(
    private kv: Deno.Kv,
    private logging: LoggingPort,
    ttlHours: number = 24,
  ) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
  }

  /**
   * Creates a new session and returns the session ID + CSRF token.
   * The session ID is a random UUID stored in KV — not the API token.
   */
  async createSession(role: Role = "admin"): Promise<{ sessionId: string; csrfToken: string }> {
    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const now = Date.now();

    const session: Session = {
      createdAt: now,
      expiresAt: now + this.ttlMs,
      csrfToken,
      role,
    };

    await this.kv.set([...SESSIONS_PREFIX, sessionId], session);
    this.logging.log(`[SESSION] Session created: ${sessionId.slice(0, 8)}…`, SyslogSeverity.INFORMATIONAL);
    return { sessionId, csrfToken };
  }

  /**
   * Validates a session ID. Returns the session if valid and not expired, null otherwise.
   */
  async validateSession(sessionId: string | undefined): Promise<Session | null> {
    if (!sessionId) return null;

    try {
      const entry = await this.kv.get<Session>([...SESSIONS_PREFIX, sessionId]);
      if (!entry.value) return null;

      if (Date.now() > entry.value.expiresAt) {
        // Session expired — clean up
        await this.kv.delete([...SESSIONS_PREFIX, sessionId]);
        return null;
      }

      return entry.value;
    } catch {
      return null;
    }
  }

  /**
   * Validates the CSRF token for a given session.
   * Uses constant-time comparison to prevent timing attacks.
   */
  async validateCsrf(sessionId: string | undefined, csrfToken: string | undefined): Promise<boolean> {
    if (!sessionId || !csrfToken) return false;

    const session = await this.validateSession(sessionId);
    if (!session) return false;

    // Constant-time comparison for CSRF token
    return this.timingSafeEqual(session.csrfToken, csrfToken);
  }

  /**
   * Revokes a single session.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.kv.delete([...SESSIONS_PREFIX, sessionId]);
    this.logging.log(`[SESSION] Session revoked: ${sessionId.slice(0, 8)}…`, SyslogSeverity.NOTICE);
  }

  /**
   * Revokes all sessions (e.g. on token rotation or security incident).
   */
  async revokeAllSessions(): Promise<void> {
    const iter = this.kv.list({ prefix: SESSIONS_PREFIX });
    let count = 0;
    for await (const entry of iter) {
      await this.kv.delete(entry.key);
      count++;
    }
    this.logging.log(`[SESSION] All sessions revoked (${count} sessions cleared).`, SyslogSeverity.WARNING);
  }

  /**
   * Simple constant-time string comparison.
   * For session/CSRF tokens (random UUIDs), timing leaks are low-risk,
   * but we apply defense-in-depth.
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }
}
