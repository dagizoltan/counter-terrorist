/**
 * WebSocket handler for real-time security events.
 * Compatible with Hono's upgradeWebSocket.
 */
import { WSContext } from "https://deno.land/x/hono@v4.3.7/helper/websocket/index.ts";
import { notificationService } from "../services/alerts.ts";
import { loggingService, SyslogSeverity } from "../services/logging.ts";
import { auditService } from "../services/audit.ts";

const clients = new Set<WSContext>();

export function broadcast(data: any) {
  const timestamp = new Date().toLocaleTimeString();
  const eventToBroadcast = {
    ...data,
    timestamp
  };
  const message = JSON.stringify(eventToBroadcast);

  for (const client of clients) {
    client.send(message);
  }

  // Trigger Deno KV Audit Event
  auditService.logEvent(eventToBroadcast).catch(console.error);

  // Trigger external notifications
  notificationService.notify(data).catch(console.error);

  // Trigger Syslog
  let severity = SyslogSeverity.INFORMATIONAL;
  if (data.type === "CRITICAL") severity = SyslogSeverity.CRITICAL;
  else if (data.type?.startsWith("DRIFT")) severity = SyslogSeverity.WARNING;
  else if (data.type === "BLOCK") severity = SyslogSeverity.NOTICE;

  loggingService.log(`${data.type}: ${data.message}`, severity).catch(console.error);
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
