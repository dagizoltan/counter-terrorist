import { LoggingPort, SyslogSeverity } from "../core/ports.ts";

export type EventType = "INFO" | "WARN" | "BLOCK" | "CRITICAL" | "DRIFT_PORT" | "DRIFT_PROCESS";

export interface SystemEvent {
  type: EventType;
  message: string;
  timestamp: string;
  data?: any;
}

export class EventBus {
  private handlers: ((event: SystemEvent) => void)[] = [];

  constructor(private logging: LoggingPort) {}

  subscribe(handler: (event: SystemEvent) => void) {
    this.handlers.push(handler);
  }

  publish(type: string, message: string, data?: any) {
    const event: SystemEvent = {
      type: type as EventType,
      message,
      timestamp: new Date().toISOString(),
      data
    };

    // Forward to syslog
    const severity = this.mapTypeToSeverity(type);
    this.logging.log(`[EVENT:${type}] ${message}`, severity)
      .catch(err => console.error(`[EVENTBUS] Failed to log event: ${err}`));

    // Notify internal subscribers
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.stack || e.message : String(e);
        console.error(`[EVENTBUS] Handler error: ${errorMsg}`);
        this.logging.log(`[EVENTBUS] Handler error: ${errorMsg}`, SyslogSeverity.ERROR)
          .catch(err => console.error(`[EVENTBUS] Failed to log handler error: ${err}`));
      }
    }
  }

  private mapTypeToSeverity(type: string): SyslogSeverity {
    switch (type) {
      case "CRITICAL": return SyslogSeverity.CRITICAL;
      case "BLOCK": return SyslogSeverity.ALERT;
      case "WARN":
      case "DRIFT_PORT":
      case "DRIFT_PROCESS":
          return SyslogSeverity.WARNING;
      default:
          return SyslogSeverity.INFORMATIONAL;
    }
  }
}

