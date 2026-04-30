import { useEffect, useRef, useState } from "preact/hooks";

export default function MeshHeatmap() {
  const canvasRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [pulses, setPulses] = useState([]);

  useEffect(() => {
    // Fetch initial nodes
    fetch("/api/mesh/nodes")
      .then(r => r.json())
      .then(data => {
         // Assign random 3D positions for visualization
         setNodes(data.map(n => ({
           ...n,
           x: (Math.random() - 0.5) * 400,
           y: (Math.random() - 0.5) * 400,
           z: (Math.random() - 0.5) * 200,
           targetPulse: 0
         })));
      });

    // Listen for events to trigger pulses
    const ws = new WebSocket(`ws://${location.host}/api/ws/events`);
    ws.onmessage = (msg) => {
      const event = JSON.parse(msg.data);
      if (event.type === "CRITICAL" || event.type === "THREAT") {
        triggerPulse(event.data?.nodeId || 'local');
      }
    };
    return () => ws.close();
  }, []);

  const triggerPulse = (nodeId) => {
    setPulses(prev => [...prev, { nodeId, radius: 0, alpha: 1, id: Math.random() }]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let animationFrame;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Draw Grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.beginPath();
      for(let i = -10; i <= 10; i++) {
        ctx.moveTo(centerX + i * 50, 0);
        ctx.lineTo(centerX + i * 50, canvas.height);
        ctx.moveTo(0, centerY + i * 50);
        ctx.lineTo(canvas.width, centerY + i * 50);
      }
      ctx.stroke();

      // Draw Nodes
      nodes.forEach(node => {
        const perspective = 400 / (400 + node.z);
        const screenX = centerX + node.x * perspective;
        const screenY = centerY + node.y * perspective;
        const size = (node.verified ? 6 : 4) * perspective;

        // Node Glow
        const grad = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, size * 4);
        grad.addColorStop(0, node.verified ? "rgba(34, 197, 94, 0.3)" : "rgba(148, 163, 184, 0.2)");
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(screenX, screenY, size * 4, 0, Math.PI * 2);
        ctx.fill();

        // Node Core
        ctx.fillStyle = node.verified ? "#22c55e" : "#94a3b8";
        ctx.beginPath();
        ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = `${8 * perspective}px Inter`;
        ctx.fillText(node.hostname, screenX + size + 4, screenY + 4);
      });

      // Update & Draw Pulses
      setPulses(prev => {
         const next = prev.filter(p => p.alpha > 0.01);
         next.forEach(p => {
           p.radius += 2;
           p.alpha *= 0.98;

           // Find node position
           const node = nodes.find(n => n.id === p.nodeId) || nodes[0];
           if (node) {
              const perspective = 400 / (400 + node.z);
              const screenX = centerX + node.x * perspective;
              const screenY = centerY + node.y * perspective;

              ctx.strokeStyle = `rgba(239, 68, 68, ${p.alpha})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(screenX, screenY, p.radius * perspective, 0, Math.PI * 2);
              ctx.stroke();
           }
         });
         return next;
      });

      animationFrame = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrame);
  }, [nodes]);

  return (
    <div class="relative w-full aspect-video bg-black rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
      <div class="absolute top-8 left-8 z-10">
         <div class="flex items-center gap-3 mb-2">
            <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span class="text-[10px] font-black uppercase tracking-[0.4em] text-red-500">Live Gossip Traffic</span>
         </div>
         <h2 class="text-3xl font-black italic text-white tracking-tighter uppercase">Mesh_Heatmap_3D</h2>
      </div>

      <div class="absolute bottom-8 right-8 z-10 flex flex-col gap-2 items-end">
         <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Verified Peers</span>
            <div class="w-3 h-3 rounded-full bg-green-500"></div>
         </div>
         <div class="flex items-center gap-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Unverified</span>
            <div class="w-3 h-3 rounded-full bg-slate-500"></div>
         </div>
      </div>

      <canvas 
        ref={canvasRef} 
        width={1200} 
        height={675}
        class="w-full h-full cursor-move"
      />
    </div>
  );
}
