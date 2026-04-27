/**
 * Logging Service for external security event persistence.
 * Supports ELK-compatible HTTP endpoints or Syslog-compatible services.
 */

export interface SecurityEvent {
  timestamp: string;
  level: "INFO" | "WARNING" | "CRITICAL";
  source: string;
  type: string;
  message: string;
  details?: any;
}

export class LoggingService {
  private remoteEndpoint: string | null;

  constructor() {
    this.remoteEndpoint = Deno.env.get("REMOTE_LOGGING_URL") || null;
    if (this.remoteEndpoint) {
      console.log(`[LOGGING] Remote logging initialized with endpoint: ${this.remoteEndpoint}`);
    } else {
      console.warn("[LOGGING] Remote logging URL not set. Security events will only be logged locally.");
    }
  }

  async logSecurityEvent(event: Omit<SecurityEvent, "timestamp">) {
    const fullEvent: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    // Always log locally
    console.log(`[SECURITY EVENT] ${JSON.stringify(fullEvent)}`);

    if (this.remoteEndpoint) {
      try {
        const response = await fetch(this.remoteEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(fullEvent),
        });

        if (!response.ok) {
          console.error(`[LOGGING] Failed to send security event to remote endpoint: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`[LOGGING] Error sending security event to remote endpoint: ${error}`);
      }
    }
  }
}

export const loggingService = new LoggingService();
