/**
 * WebSocket handler for real-time security events.
 * Compatible with Hono's upgradeWebSocket.
 */
import { WSContext } from "hono/helper/websocket/index.ts";
import { NotificationService, AuditService, EventBus } from "@domain/index.ts";
import { LoggingService, LogSeverity, LogType } from "@infrastructure/system/logging.ts";

const MAX_CONNECTIONS = 100;
const clients = new Set<WSContext>();

// Rate limiting and role storage per client
const clientMetadata = new WeakMap<WSContext, { count: number; resetAt: number; role: string }>();

export interface BroadcastData {
  type: string;
  message?: string;
  data?: any;
  [key: string]: any;
}

export interface BroadcasterDeps {
  notificationService: NotificationService;
  auditService: AuditService;
  eventBus: EventBus;
  loggingService?: LoggingService;
}

let broadcasterDeps: BroadcasterDeps | null = null;
let sharedLogging: LoggingService | null = null;

export function initBroadcaster(deps: BroadcasterDeps) {
  broadcasterDeps = deps;
  sharedLogging = deps.loggingService || new LoggingService();
}

export function broadcast(data: BroadcastData) {
  if (!broadcasterDeps) {
    // If not initialized, we can't log to the forensic ledger yet
    return;
  }
  const { notificationService, auditService, eventBus } = broadcasterDeps;
  // Use ISO 8601 instead of locale string for standardized cross-node correlation
  const timestamp = new Date().toISOString();
  const eventToBroadcast = {
    ...data,
    timestamp
  };

  // Publish to central event bus (Phase 3: Trigger Forensic Automation)
  if (data.type) {
    eventBus.publish(data.type, data.message || "", data.data);
  }
  const message = JSON.stringify(eventToBroadcast);

  for (const client of clients) {
    try {
      const metadata = clientMetadata.get(client);
      const role = metadata?.role || "viewer";

      // RBAC Filtering: Viewers only get non-sensitive telemetry
      if (role === "viewer" && (data.type === "CRITICAL" || data.type?.startsWith("ADMIN"))) {
          // Send a sanitized version or skip
          continue;
      }

      client.send(message);
    } catch {
      clients.delete(client);
    }
  }

  // Trigger Deno KV Audit Event (Escalated to AUDIT type for the ledger)
  if (data.type !== "METRICS_UPDATE" && data.type !== "DEBUG" && data.subType !== "METRICS_UPDATE") {
    // Map internal types to mandated forensic types for the ledger
    let forensicType = LogType.AUDIT;
    if (data.type === "INFO" || data.type === "ACTIVITY") forensicType = LogType.ACTIVITY;

    auditService.logEvent({
      type: forensicType, // Use mandated type instead of raw data.type
      severity: data.severity || (data.type === "CRITICAL" ? LogSeverity.ERROR : LogSeverity.INFO),
      caller: data.caller || "WS:BROADCAST",
      message: data.message || data.type || "",
      data: data.data,
      timestamp: eventToBroadcast.timestamp
    }).catch(() => {});

    // Trigger external notifications
    notificationService.notify({
      type: data.type,
      message: data.message || "",
      data: data.data
    }).catch(() => {});
  }

  // Trigger Logging (Categorized as DEBUG for UI synchronization noise reduction)
  let severity = LogSeverity.INFO;
  if (data.type === "CRITICAL") severity = LogSeverity.ERROR;
  else if (data.type?.startsWith("DRIFT") || data.type === "BLOCK") severity = LogSeverity.WARNING;

  if (sharedLogging) {
    const isMetrics = data.type === "METRICS_UPDATE" || data.subType === "METRICS_UPDATE";
    sharedLogging.log({
      timestamp: new Date().toISOString(),
      type: LogType.DEBUG, // Standardize WS noise as DEBUG
      severity,
      caller: isMetrics ? "METRICS" : "WS:EVENT",
      message: data.message || (isMetrics ? "Periodic system metrics synchronized" : data.type)
    }).catch(() => {});
  }
}

export function createWsHandler(role: string = "viewer") {
  return {
    onOpen(_event: Event, ws: WSContext) {
      if (clients.size >= MAX_CONNECTIONS) {
        if (sharedLogging) {
          sharedLogging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.WARNING,
            caller: "WS",
            message: "Max connections reached. Rejecting client."
          });
        }
        ws.close(1013, "Try Again Later - Server Too Busy");
        return;
      }

      clients.add(ws);
      clientMetadata.set(ws, { count: 0, resetAt: Date.now() + 1000, role });
      
      if (sharedLogging) {
        sharedLogging.log({
            timestamp: new Date().toISOString(),
            type: LogType.AUDIT,
            severity: LogSeverity.INFO,
            caller: "WS",
            message: `Client connected (Role: ${role}). Total connections: ${clients.size}`
        });
      }

      ws.send(JSON.stringify({
        type: "AUDIT_EVENT",
        data: {
          type: LogType.ACTIVITY,
          severity: LogSeverity.SUCCESS,
          caller: "ws:handshake",
          message: `Security Orchestrator Connected // Role: ${role.toUpperCase()}`
        }
      }));
    },
    
    onMessage(event: MessageEvent, ws: WSContext) {
      const meta = clientMetadata.get(ws);
      const now = Date.now();
      if (meta) {
        if (now > meta.resetAt) {
          meta.count = 1;
          meta.resetAt = now + 1000;
        } else {
          meta.count++;
          if (meta.count > 10) {
            if (sharedLogging) sharedLogging.log({
                timestamp: new Date().toISOString(),
                type: LogType.AUDIT,
                severity: LogSeverity.WARNING,
                caller: "WS",
                message: "Client rate limit exceeded. Disconnecting abuser."
            });
            ws.close(1008, "Policy Violation - Rate Limit Exceeded");
            return;
          }
        }
      }

      try {
        if (typeof event.data !== "string") throw new Error("Payload must be a string");
        const payload = JSON.parse(event.data);
        if (payload.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG", timestamp: new Date().toISOString() }));
        }
      } catch (e) {
        ws.close(1003, "Unsupported Data");
      }
    },
    
    onClose(_event: Event, ws: WSContext) {
      clients.delete(ws);
      clientMetadata.delete(ws);
    },
    
    onError(event: Event) {
      if (sharedLogging) {
        sharedLogging.log({
          timestamp: new Date().toISOString(),
          type: LogType.GENERIC,
          severity: LogSeverity.ERROR,
          caller: "WS",
          message: `WebSocket error: ${String(event)}`
        });
      }
    },
  };
}
