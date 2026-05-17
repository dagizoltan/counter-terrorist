import { LoggingPort, LogSeverity, LogType, EventBusPort } from "@core/ports.ts";
import { validateEvent, EventName } from "@core/event_schema.ts";

export type EventType = "INFO" | "WARN" | "BLOCK" | "CRITICAL" | "DRIFT_PORT" | "DRIFT_PROCESS" | "THREAT" | "HONEYPOT" | "EBPF_CRITICAL" | "EBPF_SYSCALL" | "EBPF_STRAY_SHELL" | "EMERGENCY" | "DEBUG" | "AUDIT_EVENT" | "EXFIL_ALERT";

export interface SystemEvent {
  type: EventType;
  message: string;
  timestamp: string;
  data?: any;
}

export class EventBus implements EventBusPort {
  private handlers: ((event: SystemEvent) => void | Promise<void>)[] = [];
  private keyedListeners: Map<string, ((data: any) => void | Promise<void>)[]> = new Map();

  constructor(private logging: LoggingPort) {}

  subscribe(handler: (event: SystemEvent) => void | Promise<void>): () => void {
    this.handlers.push(handler);
    return () => this.unsubscribe(handler);
  }

  unsubscribe(handler: (event: any) => void) {
    // Remove from main handlers
    this.handlers = this.handlers.filter(h => h !== handler);

    // Remove from all keyed listeners
    for (const [event, listeners] of this.keyedListeners.entries()) {
      const filtered = listeners.filter(l => l !== handler);
      if (filtered.length !== listeners.length) {
        if (filtered.length === 0) {
          this.keyedListeners.delete(event);
        } else {
          this.keyedListeners.set(event, filtered);
        }
      }
    }
  }

  on(event: string, callback: (data: any) => void | Promise<void>): () => void {
    if (!this.keyedListeners.has(event)) {
      this.keyedListeners.set(event, []);
    }
    this.keyedListeners.get(event)!.push(callback);
    return () => this.unsubscribe(callback);
  }

  emit(event: string, data: any) {
    const validatedData = validateEvent(event as EventName, data);
    this.publish(event, `Emitted event: ${event}`, validatedData);
  }

  publish(type: string, message: string, data?: any) {
    const validatedData = validateEvent(type as EventName, data);
    
    const event: SystemEvent = {
        type: type as EventType,
        message,
        timestamp: new Date().toISOString(),
        data: validatedData
    };

    // Forward to centralized logging (Suppress massive payloads for periodic noise)
    const severity = this.mapTypeToSeverity(type);
    const isNoise = type === "DEBUG" || type === "METRICS_UPDATE";
    const logType = isNoise ? LogType.DEBUG : LogType.AUDIT;

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: logType,
        severity,
        caller: "EVENTBUS",
        message: message,
        payload: isNoise ? undefined : validatedData
    }).catch(() => {});

    // SOV-P3: Parallelized and Time-Limited Execution
    // Prevents a single slow subscriber from stalling the entire bus.
    const allHandlers = [...this.handlers];
    const typeHandlers = this.keyedListeners.get(type) || [];

    // Combine all relevant handlers
    const tasks = [
        ...allHandlers.map(h => () => h(event)),
        ...typeHandlers.map(h => () => h(data))
    ];

    // Execute in parallel with 2s timeout
    Promise.allSettled(tasks.map(t => this.safelyExecute(t, 2000))).catch(() => {});
  }

  private async safelyExecute(fn: () => void | Promise<void>, timeoutMs: number = 5000) {
    let timeoutId: any;
    try {
      const executePromise = (async () => {
          const res = fn();
          if (res instanceof Promise) await res;
      })();

      const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`Handler timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      await Promise.race([executePromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      const errorMsg = e instanceof Error ? e.stack || e.message : String(e);
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "EVENTBUS",
          message: `Handler error: ${errorMsg}`
      }).catch(() => {});
    }
  }

  private mapTypeToSeverity(type: string): LogSeverity {
    switch (type) {
      case "EMERGENCY": return LogSeverity.ERROR;
      case "CRITICAL": 
      case "EBPF_CRITICAL":
          return LogSeverity.ERROR;
      case "BLOCK": 
      case "THREAT":
          return LogSeverity.WARNING;
      case "WARN":
      case "DRIFT_PORT":
      case "DRIFT_PROCESS":
      case "EBPF_STRAY_SHELL":
          return LogSeverity.WARNING;
      default:
          return LogSeverity.INFO;
    }
  }
}
