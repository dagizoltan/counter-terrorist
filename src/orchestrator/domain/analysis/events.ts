import { LoggingPort, LogSeverity, LogType, EventBusPort, SystemEventEnvelope } from "@core/ports.ts";
import { validateEvent, EventName, EventRegistry } from "@core/event_schema.ts";

export type EventType = "INFO" | "WARN" | "BLOCK" | "CRITICAL" | "DRIFT_PORT" | "DRIFT_PROCESS" | "THREAT" | "HONEYPOT" | "EBPF_CRITICAL" | "EBPF_SYSCALL" | "EBPF_STRAY_SHELL" | "EMERGENCY" | "DEBUG" | "AUDIT_EVENT" | "EXFIL_ALERT" | "METRIC_UPDATE" | "SIDECAR_ALERT" | "UI_BROADCAST";

export type SystemEvent<T extends EventName = EventName> = SystemEventEnvelope<T>;

export type Handler<T extends EventName> = (data: T extends keyof EventRegistry ? EventRegistry[T] : unknown, event: SystemEvent<T>) => void | Promise<void>;

export type Middleware = (event: SystemEvent, next: () => void | Promise<void>) => void | Promise<void>;

export class EventBus implements EventBusPort {
  private handlers: ((event: SystemEvent<EventName>) => void | Promise<void>)[] = [];
  private keyedListeners: Map<string, Handler<any>[]> = new Map();
  private middleware: Middleware[] = [];
  private pendingHandlers: Set<Promise<void>> = new Set();
  // Events already dispatched to handlers.
  //
  // The middleware chain has two paths that finalize: the innermost `next()` when the
  // chain runs to completion, and the error/timeout fallbacks. A middleware that calls
  // next() and then throws — or simply outlives the 5s chain timeout, which is exactly
  // what that timeout exists for — hit both, and every handler received the event twice.
  // On this bus that means duplicated audit entries, double-counted threat scores and
  // response sagas firing twice. Finalization is idempotent per event now.
  private finalized: WeakSet<object> = new WeakSet();

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

  subscribe(handler: (event: SystemEvent<EventName>) => void | Promise<void>): () => void {
    this.handlers.push(handler);
    return () => this.unsubscribe(handler as unknown as Handler<EventName>);
  }

  unsubscribe(handler: any) {
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

  on<T extends EventName>(event: T, callback: any): () => void {
    if (!this.keyedListeners.has(event)) {
      this.keyedListeners.set(event, []);
    }
    this.keyedListeners.get(event)!.push(callback);
    return () => this.unsubscribe(callback);
  }

  async emit<T extends EventName>(event: T, data: unknown): Promise<void> {
    await this.publish(event, `Emitted event: ${event}`, data);
  }

  async publish<T extends EventName>(type: T, message: string, data?: unknown): Promise<void> {
    const validatedData = validateEvent(type, data);
    
    // SOV-06: Preserve recursion guard flags during publication
    const fromAudit = (data as Record<string, unknown>)?.fromAudit as boolean | undefined;
    const correlationId = (data as Record<string, unknown>)?.correlationId as string | undefined || crypto.randomUUID();

    const event: SystemEvent<T> = {
        type,
        message,
        timestamp: new Date().toISOString(),
        data: validatedData,
        correlationId,
        fromAudit
    };

    // SOV-P2: Execute Middleware Chain
    if (this.middleware.length > 0) {
        try {
            await this.runMiddleware(0, event);
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "EVENTBUS:MIDDLEWARE",
                message: `Middleware chain failed: ${e instanceof Error ? e.message : String(e)}`
            });
            // CRITICAL FIX: Ensure event still flows even if middleware chain crashes
            await this.finalizePublish(event, (event.data || {}) as any);
        }
        return;
    }

    await this.finalizePublish(event, (validatedData || {}) as any);
  }

  private async runMiddleware<T extends EventName>(index: number, event: SystemEvent<T>) {
    if (index >= this.middleware.length) {
        await this.finalizePublish(event, event.data as T extends keyof EventRegistry ? EventRegistry[T] : unknown);
        return;
    }

    // SOV-05 STABILITY: Added timeout for middleware to prevent chain deadlocks
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
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
        await this.finalizePublish(event, (event.data || {}) as any);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private async finalizePublish<T extends EventName>(event: SystemEvent<T>, validatedData: T extends keyof EventRegistry ? EventRegistry[T] : unknown) {
    // At most one dispatch per event, whichever finalization path arrives first.
    if (this.finalized.has(event)) return;
    this.finalized.add(event);

    const type = event.type as string;
    const message = event.message;

    // SOV-05 STABILITY: Standardize metadata for recursion detection
    if (validatedData && typeof validatedData === "object") {
        (validatedData as any).fromEventBus = true;
        // SOV-07: Ensure correlationId is propagated in validatedData for future hooks
        if (!(validatedData as any).correlationId) {
            (validatedData as any).correlationId = event.correlationId;
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

    // SOV-P3: Prioritized Parallelized and Time-Limited Execution
    // SEC-03 Hardening: Prioritize critical security events to bypass background noise
    const allHandlers = [...this.handlers];
    const typeHandlers = [...(this.keyedListeners.get(type as EventName) || [])];

    if (allHandlers.length === 0 && typeHandlers.length === 0) return;

    const isHighPriority = type === "CRITICAL" || type === "EMERGENCY" || type === "EXFIL_ALERT" || type === "THREAT";

    // Execute in parallel with 2s timeout (shorter for high priority to fail fast and retry/escalate)
    const timeoutMs = isHighPriority ? 1000 : 2000;
    const executions = [];

    for (const h of allHandlers) {
        executions.push(this.safelyExecute(() => h(event), timeoutMs));
    }
    for (const h of typeHandlers) {
        executions.push(this.safelyExecute(() => h(validatedData, event), timeoutMs));
    }

    if (isHighPriority) {
        // Await high priority immediately to ensure deterministic response order
        await Promise.all(executions);
    } else {
        // Fire and track for non-critical noise
        Promise.all(executions).catch(err => {
            console.error(`Background event execution failure: ${err}`);
        });
    }
  }

  private async safelyExecute(fn: () => void | Promise<void>, timeoutMs: number = 5000): Promise<void> {
    const handlerPromise = (async () => {
        try {
            const res = fn();
            if (!(res instanceof Promise)) return;

            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error(`Handler timeout after ${timeoutMs}ms`)), timeoutMs);
                });

                await Promise.race([res, timeoutPromise]);
            } finally {
                if (timeoutId) clearTimeout(timeoutId);
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.stack || e.message : String(e);
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "EVENTBUS",
                message: `Handler error: ${errorMsg}`
            }).catch(err => console.error(`CRITICAL: EventBus logging failed: ${err}`));
        }
    })();

    this.pendingHandlers.add(handlerPromise);
    try {
        await handlerPromise;
    } finally {
        this.pendingHandlers.delete(handlerPromise);
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
