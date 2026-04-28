/**
 * WebSocket handler for real-time security events.
 * Compatible with Hono's upgradeWebSocket.
 */
import { WSContext } from "hono/helper/websocket/index.ts";
import { NotificationService, AuditService, EventBus } from "../services/index.ts";
import { LoggingService, SyslogSeverity } from "../infrastructure/logging.ts";

const clients = new Set<WSContext>();

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
}

let broadcasterDeps: BroadcasterDeps | null = null;

export function initBroadcaster(deps: BroadcasterDeps) {
  broadcasterDeps = deps;
}

export function broadcast(data: BroadcastData) {
  if (!broadcasterDeps) {
    console.warn("[WS] Broadcaster not initialized. Data lost:", data.type);
    return;
  }
  const { notificationService, auditService, eventBus } = broadcasterDeps;
  const timestamp = new Date().toLocaleTimeString();
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
      client.send(message);
    } catch {
      clients.delete(client);
    }
  }

  // Trigger Deno KV Audit Event
  auditService.logEvent({
    type: data.type,
    message: data.message || "",
    data: data.data,
    timestamp: eventToBroadcast.timestamp
  }).catch(console.error);

  // Trigger external notifications
  notificationService.notify({
    type: data.type,
    message: data.message || "",
    data: data.data
  }).catch(console.error);

  // Trigger Syslog
  let severity = SyslogSeverity.INFORMATIONAL;
  if (data.type === "CRITICAL") severity = SyslogSeverity.CRITICAL;
  else if (data.type?.startsWith("DRIFT")) severity = SyslogSeverity.WARNING;
  else if (data.type === "BLOCK") severity = SyslogSeverity.NOTICE;

  const logging = new LoggingService();
  logging.log(`${data.type}: ${data.message || ""}`, severity).catch(console.error);
}

export const wsHandler = {
  onOpen(_event: Event, ws: WSContext) {
    clients.add(ws);
    console.log("WebSocket client connected");
    ws.send(JSON.stringify({
      type: "INFO",
      message: "Security Orchestrator WebSocket Connected",
      timestamp: new Date().toLocaleTimeString()
    }));
  },
  onMessage(event: MessageEvent, _ws: WSContext) {
    console.log("Message from client:", event.data);
  },
  onClose(_event: Event, ws: WSContext) {
    console.log("WebSocket client disconnected");
    clients.delete(ws);
  },
  onError(event: Event) {
    console.error("WebSocket error:", event);
  },
};
