/**
 * WebSocket handler for real-time security events.
 */

export function handleWs(socket: WebSocket) {
  socket.onopen = () => {
    console.log("WebSocket client connected");
    socket.send(JSON.stringify({
      type: "SYSTEM",
      message: "Security Orchestrator WebSocket Connected",
      timestamp: new Date().toISOString()
    }));
  };

  socket.onmessage = (event) => {
    console.log("Message from client:", event.data);
  };

  socket.onclose = () => {
    console.log("WebSocket client disconnected");
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
}
