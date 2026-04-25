/**
 * WebSocket handler for real-time security events.
 */

const clients = new Set<WebSocket>();

export function broadcast(data: any) {
  const message = JSON.stringify({
    ...data,
    timestamp: new Date().toLocaleTimeString()
  });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function handleWs(socket: WebSocket) {
  clients.add(socket);

  socket.onopen = () => {
    console.log("WebSocket client connected");
    socket.send(JSON.stringify({
      type: "INFO",
      message: "Security Orchestrator WebSocket Connected",
      timestamp: new Date().toLocaleTimeString()
    }));
  };

  socket.onmessage = (event) => {
    console.log("Message from client:", event.data);
  };

  socket.onclose = () => {
    console.log("WebSocket client disconnected");
    clients.delete(socket);
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}
