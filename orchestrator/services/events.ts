import { pcap } from "../protection/index.ts";
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

  publish(type: EventType, message: string, data?: any) {
    const event: SystemEvent = {
      type,
      message,
      timestamp: new Date().toISOString(),
      data
    };

    // Forward to syslog
    const severity = this.mapTypeToSeverity(type);
    this.logging.log(`[EVENT:${type}] ${message}`, severity);

    // Notify internal subscribers
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (e) {
        console.error("[EVENTBUS] Handler error:", e);
      }
    }
  }

  private mapTypeToSeverity(type: EventType): SyslogSeverity {
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

