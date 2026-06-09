import { LoggingPort, LogSeverity, LogType, EventBusPort, SystemEventEnvelope, EventHandler, EventPriority } from "@core/ports.ts";
import { validateEvent, EventName } from "@core/event_schema.ts";

export type EventType = "INFO" | "WARN" | "BLOCK" | "CRITICAL" | "DRIFT_PORT" | "DRIFT_PROCESS" | "THREAT" | "HONEYPOT" | "EBPF_CRITICAL" | "EBPF_SYSCALL" | "EBPF_STRAY_SHELL" | "EMERGENCY" | "DEBUG" | "AUDIT_EVENT" | "EXFIL_ALERT" | "METRIC_UPDATE" | "SIDECAR_ALERT" | "UI_BROADCAST";

export type SystemEvent<T extends EventName = string> = SystemEventEnvelope<T>;

export type Handler<T extends EventName> = EventHandler<T>;

export type Middleware = (event: SystemEvent, next: () => void | Promise<void>) => void | Promise<void>;

interface RegisteredHandler {
    fn: (...args: any[]) => void | Promise<void>;
    priority: EventPriority;
}

export class EventBus implements EventBusPort {
  private handlers: RegisteredHandler[] = [];
  private keyedListeners: Map<string, RegisteredHandler[]> = new Map();
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

      this.handlers = [];
      this.keyedListeners.clear();
      this.middleware = [];
      this.pendingHandlers.clear();
  }

  use(mw: Middleware) {
    this.middleware.push(mw);
  }

  subscribe(handler: (event: SystemEventEnvelope<string>) => void | Promise<void>, priority: EventPriority = EventPriority.NORMAL): () => void {
    this.handlers.push({ fn: handler, priority });
    return () => this.unsubscribe(handler);
  }

  unsubscribe(handler: (event: SystemEventEnvelope<string>) => void) {
    this.handlers = this.handlers.filter(h => h.fn !== handler);
    for (const [event, listeners] of this.keyedListeners.entries()) {
      const filtered = listeners.filter(l => l.fn !== handler);
      if (filtered.length !== listeners.length) {
        if (filtered.length === 0) {
          this.keyedListeners.delete(event);
        } else {
          this.keyedListeners.set(event, filtered);
        }
      }
    }
  }

  on<T extends EventName>(event: T, callback: EventHandler<T>, priority: EventPriority = EventPriority.NORMAL): () => void {
    const key = event as string;
    if (!this.keyedListeners.has(key)) {
      this.keyedListeners.set(key, []);
    }
    this.keyedListeners.get(key)!.push({ fn: callback, priority });
    return () => this.unsubscribe(callback as unknown as (event: SystemEventEnvelope<string>) => void);
  }

  async emit<T extends EventName>(event: T, data: unknown): Promise<void> {
    await this.publish(event, `Emitted event: ${event}`, data);
  }

  async publish<T extends EventName>(type: T, message: string, data?: unknown): Promise<void> {
    const validatedData = validateEvent(type as string, data);
    
    const dataObj = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
    const fromAudit = dataObj.fromAudit as boolean | undefined;
    const correlationId = dataObj.correlationId as string | undefined || crypto.randomUUID();

    const event: SystemEvent<T> = {
        type,
        message,
        timestamp: new Date().toISOString(),
        data: validatedData,
        correlationId,
        fromAudit
    };

    if (this.middleware.length > 0) {
        try {
            await this.runMiddleware(0, event as SystemEvent<string>);
        } catch (e) {
            this.logging.log({
                timestamp: new Date().toISOString(),
                type: LogType.GENERIC,
                severity: LogSeverity.ERROR,
                caller: "EVENTBUS:MIDDLEWARE",
                message: `Middleware chain failed: ${e instanceof Error ? e.message : String(e)}`
            });
            await this.finalizePublish(event as SystemEvent<string>, event.data);
        }
        return;
    }

    await this.finalizePublish(event as SystemEvent<string>, validatedData);
  }

  private async runMiddleware(index: number, event: SystemEvent<string>) {
    if (index >= this.middleware.length) {
        this.finalizePublish(event, event.data);
        return;
    }

    let timeoutId: number | undefined;
    const timeoutMs = 5000;

    try {
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = (setTimeout(() => reject(new Error(`Middleware ${index} timed out after ${timeoutMs}ms`)), timeoutMs) as any);
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

  /**
   * Audit 12.5: Parallel Worker Pool with Priority Execution.
   * Executes handlers in parallel batches grouped by priority.
   */
  private async finalizePublish(event: SystemEvent<string>, validatedData: unknown) {
    const type = event.type;
    const message = event.message;

    if (validatedData && typeof validatedData === "object" && validatedData !== null) {
        const dataObj = validatedData as Record<string, unknown>;
        dataObj.fromEventBus = true;
        if (!dataObj.correlationId) {
            dataObj.correlationId = event.correlationId;
        }
    }

    const severity = this.mapTypeToSeverity(type);
    const isNoise = type === "DEBUG" || type === "METRIC_UPDATE" || (type as string) === "INFO";
    const logType = isNoise ? LogType.DEBUG : LogType.AUDIT;

    this.logging.log({
        timestamp: new Date().toISOString(),
        type: logType,
        severity,
        caller: "EVENTBUS",
        message: message,
        payload: isNoise ? undefined : validatedData as Record<string, unknown>
    }).catch(err => console.error(`Background task failure: ${err}`));

    // Execute handlers grouped by priority
    const priorityGroups = new Map<EventPriority, RegisteredHandler[]>();

    // Add general subscribers
    for (const h of this.handlers) {
        if (!priorityGroups.has(h.priority)) priorityGroups.set(h.priority, []);
        priorityGroups.get(h.priority)!.push(h);
    }

    // Add type-specific listeners
    const typeHandlers = this.keyedListeners.get(type) || [];
    for (const h of typeHandlers) {
        if (!priorityGroups.has(h.priority)) priorityGroups.set(h.priority, []);
        priorityGroups.get(h.priority)!.push(h);
    }

    const priorities = Array.from(priorityGroups.keys()).sort((a, b) => a - b);

    for (const priority of priorities) {
        const handlers = priorityGroups.get(priority)!;
        const executions = handlers.map(h => {
            // Determine if it's a general subscriber or keyed listener
            // General subscribers receive the whole event, keyed listeners receive data + event
            if (this.handlers.some(genH => genH === h)) {
                return this.safelyExecute(() => h.fn(event), 2000);
            } else {
                return this.safelyExecute(() => h.fn(validatedData, event), 2000);
            }
        });

        await Promise.all(executions);
    }
  }

  private async safelyExecute(fn: () => void | Promise<void>, timeoutMs: number = 5000): Promise<void> {
    const handlerPromise = (async () => {
        try {
            const res = fn();
            if (!(res instanceof Promise)) return;

            let timeoutId: number | undefined;
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = (setTimeout(() => reject(new Error(`Handler timeout after ${timeoutMs}ms`)), timeoutMs) as any);
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
