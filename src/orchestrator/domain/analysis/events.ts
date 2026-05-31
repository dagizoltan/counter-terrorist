import { LoggingPort, LogSeverity, LogType, EventBusPort } from "@core/ports.ts";
import { validateEvent, EventName, EventRegistry } from "@core/event_schema.ts";
import { z } from "npm:zod";

export type EventType = "INFO" | "WARN" | "BLOCK" | "CRITICAL" | "DRIFT_PORT" | "DRIFT_PROCESS" | "THREAT" | "HONEYPOT" | "EBPF_CRITICAL" | "EBPF_SYSCALL" | "EBPF_STRAY_SHELL" | "EMERGENCY" | "DEBUG" | "AUDIT_EVENT" | "EXFIL_ALERT" | "METRIC_UPDATE";

export interface SystemEvent<T extends EventName = any> {
  type: T;
  message: string;
  timestamp: string;
  data: z.infer<EventRegistry[T]>;
  correlationId?: string;
}

export type Handler<T extends EventName> = (data: z.infer<EventRegistry[T]>, event: SystemEvent<T>) => void | Promise<void>;

export type Middleware = (event: SystemEvent, next: () => void | Promise<void>) => void | Promise<void>;

export class EventBus implements EventBusPort {
  private handlers: ((event: SystemEvent) => void | Promise<void>)[] = [];
  private keyedListeners: Map<string, Handler<any>[]> = new Map();
  private middleware: Middleware[] = [];
  private pendingHandlers: Set<Promise<void>> = new Set();

  constructor(private logging: LoggingPort) {}

  public async shutdown() {
      const start = Date.now();
      const timeoutMs = 10000;

      while (this.pendingHandlers.size > 0) {
          const elapsed = Date.now() - start;
          if (elapsed > timeoutMs) {
              this.logging.log({
                  timestamp: new Date().toISOString(),
                  type: LogType.GENERIC,
                  severity: LogSeverity.WARNING,
                  caller: "EVENTBUS",
                  message: `Shutdown timed out with ${this.pendingHandlers.size} pending handlers still active.`
              });
              break;
          }

          await Promise.race([
              Promise.all(Array.from(this.pendingHandlers)),
              new Promise(r => setTimeout(r, 100))
          ]);
      }

      // Clear all handlers to prevent memory leaks during re-initialization
      this.handlers = [];
      this.keyedListeners.clear();
      this.middleware = [];
      this.pendingHandlers.clear();
  }

  use(mw: Middleware) {
    this.middleware.push(mw);
  }

  subscribe(handler: (event: SystemEvent<any>) => void | Promise<void>): () => void {
    this.handlers.push(handler);
    return () => this.unsubscribe(handler);
  }

  unsubscribe(handler: Handler<any>) {
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

  on<T extends EventName>(event: T, callback: Handler<T>): () => void {
    if (!this.keyedListeners.has(event)) {
      this.keyedListeners.set(event, []);
    }
    this.keyedListeners.get(event)!.push(callback);
    return () => this.unsubscribe(callback);
  }

  emit<T extends EventName>(event: T, data: z.infer<EventRegistry[T]>) {
    this.publish(event, `Emitted event: ${event}`, data);
  }

  publish<T extends EventName>(type: T, message: string, data?: z.infer<EventRegistry[T]>) {
    const validatedData = validateEvent(type, data);
    
    // SOV-06: Preserve recursion guard flags during publication
    const fromAudit = (data as any)?.fromAudit;
    const correlationId = (data as any)?.correlationId || crypto.randomUUID();

    const event: SystemEvent = {
        type: type as EventType,
        message,
        timestamp: new Date().toISOString(),
        data: validatedData,
        correlationId,
        fromAudit
    } as any;

    // SOV-P2: Execute Middleware Chain
    if (this.middleware.length > 0) {
        this.runMiddleware(0, event).catch(e => {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "EVENTBUS:MIDDLEWARE",
                message: `Middleware chain failed: ${e instanceof Error ? e.message : String(e)}`
            });
            // CRITICAL FIX: Ensure event still flows even if middleware chain crashes
            this.finalizePublish(event, event.data);
        });
        return;
    }

    this.finalizePublish(event, validatedData);
  }

  private async runMiddleware(index: number, event: SystemEvent) {
    if (index >= this.middleware.length) {
        this.finalizePublish(event, event.data);
        return;
    }

    // SOV-05 STABILITY: Added timeout for middleware to prevent chain deadlocks
    let timeoutId: any;
    const timeoutMs = 5000;

    try {
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`Middleware ${index} timed out after ${timeoutMs}ms`)), timeoutMs);
        });

        await Promise.race([
            this.middleware[index](event, () => this.runMiddleware(index + 1, event)),
            timeoutPromise
        ]);
    } catch (e) {
        this.logging.log({
            timestamp: new Date().toISOString(),
            type: LogType.GENERIC,
            severity: LogSeverity.ERROR,
            caller: "EVENTBUS:MIDDLEWARE",
            message: `Middleware ${index} failed: ${e instanceof Error ? e.message : String(e)}. Forcing finalization.`
        });
        this.finalizePublish(event, event.data);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private finalizePublish(event: SystemEvent, validatedData: any) {
    const type = event.type as string;
    const message = event.message;

    // SOV-05 STABILITY: Standardize metadata for recursion detection
    if (validatedData && typeof validatedData === "object") {
        validatedData.fromEventBus = true;
        // SOV-07: Ensure correlationId is propagated in validatedData for future hooks
        if (!validatedData.correlationId) {
            validatedData.correlationId = event.correlationId;
        }
    }

    // Forward to centralized logging (Suppress massive payloads for periodic noise)
    const severity = this.mapTypeToSeverity(type);
    const isNoise = type === "DEBUG" || type === "METRIC_UPDATE" || (type as string) === "INFO";
    const logType = isNoise ? LogType.DEBUG : LogType.AUDIT;

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: logType,
        severity,
        caller: "EVENTBUS",
        message: message,
        payload: isNoise ? undefined : validatedData
    }).catch(err => console.error(`Background task failure: ${err}`));

    // SOV-P3: Parallelized and Time-Limited Execution
    // BUG FIX: Use snapshots of handlers to prevent race conditions during concurrent mutations (unsubscribes)
    const allHandlers = [...this.handlers];
    const typeHandlers = [...(this.keyedListeners.get(type as EventName) || [])];

    if (allHandlers.length === 0 && typeHandlers.length === 0) return;

    // Execute in parallel with 2s timeout
    for (const h of allHandlers) {
        this.safelyExecute(() => h(event), 2000);
    }
    for (const h of typeHandlers) {
        this.safelyExecute(() => h(validatedData, event), 2000);
    }
  }

  private safelyExecute(fn: () => void | Promise<void>, timeoutMs: number = 5000) {
    try {
      const res = fn();
      if (!(res instanceof Promise)) return; // PERFORMANCE: Avoid microtask overhead for sync handlers

      let resolveRef: (() => void) | null = null;
      const wrappedPromise = new Promise<void>((resolve) => {
        resolveRef = resolve;
      });
      this.pendingHandlers.add(wrappedPromise);

      (async () => {
        let timeoutId: any;
        try {
          const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(`Handler timeout after ${timeoutMs}ms`)), timeoutMs);
          });

          await Promise.race([res, timeoutPromise]);
        } catch (e) {
          const errorMsg = e instanceof Error ? e.stack || e.message : String(e);
          this.logging.log({
              timestamp: new Date().toISOString(),
              type: LogType.GENERIC,
              severity: LogSeverity.ERROR,
              caller: "EVENTBUS",
              message: `Async Handler error: ${errorMsg}`
          }).catch(err => console.error(`Background task failure: ${err}`));
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
          this.pendingHandlers.delete(wrappedPromise);
          if (resolveRef) (resolveRef as () => void)();
        }
      })();
    } catch (e) {
      const errorMsg = e instanceof Error ? e.stack || e.message : String(e);
      this.logging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "EVENTBUS",
          message: `Handler error: ${errorMsg}`
      }).catch(err => console.error(`Background task failure: ${err}`));
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
