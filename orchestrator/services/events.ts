import { pcap } from "../protection/index.ts";
import { SyslogSeverity, loggingService } from "./logging.ts";

export type EventType = "INFO" | "WARN" | "BLOCK" | "CRITICAL" | "DRIFT_PORT" | "DRIFT_PROCESS";

export interface SystemEvent {
  type: EventType;
  message: string;
  timestamp: string;
  data?: any;
}

class EventBus {
  private handlers: ((event: SystemEvent) => void)[] = [];

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
    loggingService.log(`[EVENT:${type}] ${message}`, severity);

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

export const eventBus = new EventBus();

// --- Automated Forensic Response ---
eventBus.subscribe((event) => {
  if (event.type === "CRITICAL") {
    console.log("[FORENSICS] Critical event detected! Triggering automated PCAP...");
    pcap.startCapture("any", 60, `intrusion_${Date.now()}.pcap`)
      .then(res => {
        if (res.success) console.log("[FORENSICS] PCAP capture initiated successfully.");
        else console.warn("[FORENSICS] PCAP capture failed:", res.message);
      })
      .catch(err => console.error("[FORENSICS] Unexpected PCAP error:", err));
  }
});
