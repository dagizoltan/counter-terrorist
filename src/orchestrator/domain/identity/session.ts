import { LoggingPort, LogSeverity, LogType } from "@core/ports.ts";
import { SessionRepository } from "../repositories/session_repository.ts";

export interface Session {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  lastSeen: string;
  csrfToken: string;
  metadata?: Record<string, any>;
}

export class SessionService {
  constructor(
    private repo: SessionRepository,
    private logging: LoggingPort,
    private ttlHours: number = 24
  ) {}

  async createSession(userId: string, role: string, metadata?: any): Promise<Session> {
    const id = crypto.randomUUID();
    const csrfToken = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 60 * 60 * 1000);

    const session: Session = {
      id,
      userId,
      role,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      lastSeen: now.toISOString(),
      csrfToken,
      metadata,
    };

    await this.repo.save(session);
    
    this.logging.log({
        timestamp: now.toISOString(),
        type: LogType.AUDIT,
        severity: LogSeverity.INFO,
        caller: "SESSION",
        message: `New session created for ${userId} [${role}]`
    });

    return session;
  }

  async validateSession(id: string): Promise<{ success: boolean; data?: Session; error?: string }> {
    const session = await this.repo.getById(id);
    if (!session) return { success: false, error: "Session not found" };

    const expiresAt = new Date(session.expiresAt).getTime();
    if (Date.now() > expiresAt) {
      await this.repo.delete(id);
      return { success: false, error: "Session expired" };
    }

    // Update last seen
    session.lastSeen = new Date().toISOString();
    await this.repo.save(session);

    return { success: true, data: session };
  }

  async validateCsrf(id: string, token: string): Promise<boolean> {
    const session = await this.repo.getById(id);
    if (!session) return false;
    return session.csrfToken === token;
  }

  async revokeSession(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async cleanupExpired(): Promise<number> {
    let count = 0;
    const now = Date.now();
    for await (const session of this.repo.listAll()) {
      if (new Date(session.expiresAt).getTime() < now) {
        await this.repo.delete(session.id);
        count++;
      }
    }
    return count;
  }
}
