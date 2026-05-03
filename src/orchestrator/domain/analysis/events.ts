import { LoggingPort, SyslogSeverity, EventBusPort } from "@core/ports.ts";
import { validateEvent, EventName } from "@core/event_schema.ts";

export type EventType = "INFO" | "WARN" | "BLOCK" | "CRITICAL" | "DRIFT_PORT" | "DRIFT_PROCESS" | "THREAT" | "HONEYPOT" | "EBPF_CRITICAL" | "EBPF_SYSCALL" | "EBPF_STRAY_SHELL" | "EMERGENCY";

export interface SystemEvent {
  type: EventType;
  message: string;
  timestamp: string;
  data?: any;
}

export class EventBus implements EventBusPort {
  private handlers: ((event: SystemEvent) => void | Promise<void>)[] = [];
  private keyedListeners: Map<string, ((data: any) => void | Promise<void>)[]> = new Map();
  private eventPool: SystemEvent[] = [];
  private readonly MAX_POOL_SIZE = 100;

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
    
    // Pooling logic to reduce GC pressure
    let event: SystemEvent;
    if (this.eventPool.length > 0) {
        event = this.eventPool.pop()!;
        event.type = type as EventType;
        event.message = message;
        event.timestamp = new Date().toISOString();
        event.data = validatedData;
    } else {
        event = {
            type: type as EventType,
            message,
            timestamp: new Date().toISOString(),
            data: validatedData
        };
    }

    // Forward to syslog
    const severity = this.mapTypeToSeverity(type);
    this.logging.log(`[EVENT:${type}] ${message}`, severity)
      .catch(err => console.error(`[EVENTBUS] Failed to log event: ${err}`));

    // Notify internal subscribers
    for (const handler of this.handlers) {
      this.safelyExecute(() => handler(event));
    }

    // Notify keyed listeners
    const listeners = this.keyedListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        this.safelyExecute(() => listener(data));
      }
    }

    // Return to pool if not full
    if (this.eventPool.length < this.MAX_POOL_SIZE) {
        this.eventPool.push(event);
    }
  }

  private async safelyExecute(fn: () => void | Promise<void>) {
    try {
      const res = fn();
      if (res instanceof Promise) {
        await res;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.stack || e.message : String(e);
      console.error(`[EVENTBUS] Handler error: ${errorMsg}`);
      this.logging.log(`[EVENTBUS] Handler error: ${errorMsg}`, SyslogSeverity.ERROR)
        .catch(err => console.error(`[EVENTBUS] Failed to log handler error: ${err}`));
    }
  }

  private mapTypeToSeverity(type: string): SyslogSeverity {
    switch (type) {
      case "EMERGENCY": return SyslogSeverity.EMERGENCY;
      case "CRITICAL": 
      case "EBPF_CRITICAL":
          return SyslogSeverity.CRITICAL;
      case "BLOCK": 
      case "THREAT":
          return SyslogSeverity.ALERT;
      case "WARN":
      case "DRIFT_PORT":
      case "DRIFT_PROCESS":
      case "EBPF_STRAY_SHELL":
          return SyslogSeverity.WARNING;
      default:
          return SyslogSeverity.INFORMATIONAL;
    }
  }
}
