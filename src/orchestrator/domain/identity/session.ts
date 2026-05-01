/**
 * Session Management Service.
 *
 * Manages ephemeral, revocable browser sessions stored in Deno KV.
 * Session IDs are random UUIDs — the raw API_TOKEN is never stored client-side.
 */

import { LoggingPort, SyslogSeverity } from "@core/ports.ts";
import { Role } from "./api_keys.ts";
import { KvRepository } from "@infrastructure/persistence/repositories/kv_repository.ts";
import { secureCompare } from "@infrastructure/system/validation.ts";
import { withTelemetry } from "@core/service_utils.ts";

export interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
  csrfToken: string;
  role: Role;
}

export class SessionService {
  private ttlMs: number;
  private repo: KvRepository<Session>;

  constructor(
    private kv: Deno.Kv,
    private logging: LoggingPort,
    ttlHours: number = 24,
  ) {
    this.ttlMs = ttlHours * 60 * 60 * 1000;
    this.repo = new KvRepository<Session>(kv, "sessions");

    // Wrap public methods
    this.createSession = withTelemetry("Session:Create", this.createSession.bind(this), logging) as any;
    this.validateSession = withTelemetry("Session:Validate", this.validateSession.bind(this), logging) as any;
    this.revokeAllSessions = withTelemetry("Session:RevokeAll", this.revokeAllSessions.bind(this), logging) as any;
  }

  async createSession(role: Role = "admin"): Promise<{ sessionId: string; csrfToken: string }> {
    const sessionId = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      createdAt: now,
      expiresAt: now + this.ttlMs,
      csrfToken,
      role,
    };

    await this.repo.set(sessionId, session);
    return { sessionId, csrfToken };
  }

  /**
   * Validates a session ID. Returns the session if valid and not expired, null otherwise.
   */
  async validateSession(sessionId: string | undefined): Promise<Session | null> {
    if (!sessionId) return null;

    try {
      const session = await this.repo.get(sessionId);
      if (!session) return null;

      if (Date.now() > session.expiresAt) {
        await this.repo.delete(sessionId);
        return null;
      }

      return session;
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
    return await secureCompare(session.csrfToken, csrfToken);
  }

  /**
   * Revokes a single session.
   */
  async revokeSession(sessionId: string): Promise<void> {
    await this.repo.delete(sessionId);
  }

  /**
   * Revokes all sessions (e.g. on token rotation or security incident).
   */
  async revokeAllSessions(): Promise<void> {
    const sessions = await this.repo.list();
    for (const session of sessions) {
      await this.repo.delete(session.id);
    }
  }
}
