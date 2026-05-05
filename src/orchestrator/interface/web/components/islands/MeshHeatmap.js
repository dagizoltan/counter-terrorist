/**
 * MeshHeatmap Island
 * 3D-perspective tactical traffic visualization.
 */
class MeshHeatmap extends HTMLElement {
  constructor() {
    super();
    this.nodes = [];
    this.pulses = [];
  }

  connectedCallback() {
    this.renderBase();
    this.fetchNodes();
    this.initWebSocket();
    this.animate();
    window.addEventListener('resize', () => this.resize());
  }

  disconnectedCallback() {
    if (this.ws) this.ws.close();
    cancelAnimationFrame(this.animationFrame);
  }

  async fetchNodes() {
    try {
      const res = await fetch("/api/mesh/nodes");
      const data = await res.json();
      this.nodes = [
        { id: 'local', hostname: data.local, x: 0, y: 0, z: 0, verified: true },
        ...data.peers.map(n => ({
          ...n,
          x: (Math.random() - 0.5) * 600,
          y: (Math.random() - 0.5) * 400,
          z: (Math.random() - 0.5) * 200,
        }))
      ];
      const nodeCountEl = this.querySelector('#mesh-node-count');
      if (nodeCountEl) nodeCountEl.textContent = `${this.nodes.length} Nodes Active`;
    } catch (e) {
      console.error("[HEATMAP] Node fetch failure:", e);
    }
  }

  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/api/ws/events`);
    this.ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data);
        if (event.type === "CRITICAL" || event.type === "THREAT") {
          this.triggerPulse(event.data?.nodeId || 'local');
        }
      } catch (e) {}
    };
  }

  triggerPulse(nodeId) {
    this.pulses.push({ nodeId, radius: 0, alpha: 1 });
  }

  renderBase() {
    this.innerHTML = `
      <div class="relative w-full h-full bg-black/20 rounded-2xl overflow-hidden border border-white/5">
        <canvas id="heatmap-canvas" style="display: block; width: 100%; height: 100%;"></canvas>
        <div class="absolute top-8 left-8">
           <div class="flex items-center gap-3 mb-4">
              <div class="dot active" style="background:var(--danger); width: 8px; height: 8px;"></div>
              <span class="mono text-[11px] font-black uppercase tracking-[0.5em] text-danger/80">Live_Gossip_Traffic</span>
           </div>
           <h2 class="mono text-3xl font-black italic text-white/90 tracking-tighter uppercase">Mesh_Heatmap_3D</h2>
        </div>
        <div class="absolute bottom-8 right-8 flex flex-col items-end gap-2">
            <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest" id="mesh-node-count">0 Nodes Active</span>
        </div>
      </div>
    `;
    this.canvas = this.querySelector('#heatmap-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.resize();
  }

  resize() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }

  animate() {
    this.draw();
    this.animationFrame = requestAnimationFrame(() => this.animate());
  }

  draw() {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.beginPath();
    for (let i = -10; i <= 10; i++) {
      ctx.moveTo(centerX + i * 80, 0); ctx.lineTo(centerX + i * 80, height);
      ctx.moveTo(0, centerY + i * 80); ctx.lineTo(width, centerY + i * 80);
    }
    ctx.stroke();

    // Nodes
    this.nodes.forEach(node => {
      const perspective = 400 / (400 + node.z);
      const screenX = centerX + node.x * perspective;
      const screenY = centerY + node.y * perspective;
      const size = (node.verified ? 6 : 4) * perspective;

      // Core Static Node
      ctx.fillStyle = node.verified ? "var(--success)" : "var(--text-muted)";
      ctx.beginPath(); ctx.arc(screenX, screenY, size, 0, Math.PI * 2); ctx.fill();

      // Label
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `900 ${9 * perspective}px JetBrains Mono`;
      ctx.fillText(node.hostname?.toUpperCase() || 'NODE', screenX + size + 5, screenY + 4);
    });

    // Pulses Disabled for Quiet Security
    this.pulses = [];
  }
}

customElements.define('mesh-heatmap', MeshHeatmap);
