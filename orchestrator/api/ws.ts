/**
 * WebSocket handler for real-time security events.
 * Compatible with Hono's upgradeWebSocket.
 */
import { WSContext } from "hono/ws";

const clients = new Set<WSContext>();

export function broadcast(data: any) {
  const message = JSON.stringify({
    ...data,
    timestamp: new Date().toLocaleTimeString()
  });
  for (const client of clients) {
    client.send(message);
  }
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
