/**
 * MeshGraph Island
 * High-density tactical coordinate map for the security mesh.
 */
class MeshGraph extends HTMLElement {
  constructor() {
    super();
    this.nodes = [];
    this.localNodeId = "UNKNOWN";
  }

  connectedCallback() {
    this.renderBase();
    this.fetchNodes();
    this.interval = setInterval(() => this.fetchNodes(), 5000);
    window.addEventListener('resize', () => this.draw());
  }

  disconnectedCallback() {
    clearInterval(this.interval);
  }

  async fetchNodes() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/mesh/nodes', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await res.json();
        this.nodes = data.peers;
        this.localNodeId = data.local;
        this.draw();
      }
    } catch (e) {}
  }

  renderBase() {
    this.innerHTML = `
      <div class="relative w-full h-full min-h-[500px] flex items-center justify-center overflow-hidden bg-black/20">
        <canvas id="mesh-canvas" class="w-full h-full"></canvas>
        <div id="mesh-overlay" class="absolute inset-0 pointer-events-none">
           <div class="absolute top-4 left-4">
              <span class="mono text-[9px] font-black text-slate-600 uppercase tracking-[0.4em]">Grid_Calibration: AUTO</span>
           </div>
        </div>
      </div>
    `;
    this.canvas = this.querySelector('#mesh-canvas');
    this.ctx = this.canvas.getContext('2d');
  }

  draw() {
    const width = this.canvas.width = this.canvas.clientWidth;
    const height = this.canvas.height = this.canvas.clientHeight;
    const ctx = this.ctx;
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Draw Tactical Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = step; x < width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = step; y < height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    // Draw Crosshair at Center
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath();
    ctx.moveTo(centerX - 20, centerY); ctx.lineTo(centerX + 20, centerY);
    ctx.moveTo(centerX, centerY - 20); ctx.lineTo(centerX, centerY + 20);
    ctx.stroke();

    // Draw Local Node
    this.drawNode(ctx, centerX, centerY, this.localNodeId, true, 'ACTIVE');

    // Draw Peers in a Tactical Circle
    const radius = Math.min(width, height) * 0.35;
    this.nodes.forEach((peer, i) => {
       const angle = (i / this.nodes.length) * 2 * Math.PI;
       const px = centerX + Math.cos(angle) * radius;
       const py = centerY + Math.sin(angle) * radius;

       // Draw Connection Line
       ctx.strokeStyle = peer.status === 'ACTIVE' ? 'hsla(var(--success-h), 100%, 50%, 0.1)' : 'rgba(255,255,255,0.05)';
       ctx.setLineDash([5, 5]);
       ctx.beginPath();
       ctx.moveTo(centerX, centerY);
       ctx.lineTo(px, py);
       ctx.stroke();
       ctx.setLineDash([]);

       this.drawNode(ctx, px, py, peer.hostname || peer.id, false, peer.status);
    });
  }

  drawNode(ctx, x, y, label, isLocal, status) {
    const isActive = status === 'ACTIVE';
    const color = isLocal ? 'var(--primary)' : (isActive ? 'var(--success)' : 'var(--danger)');
    const glow = isLocal ? 'var(--primary-glow)' : (isActive ? 'var(--success-glow)' : 'var(--danger-glow)');

    // Node Core
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, isLocal ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    // Node Core
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, isLocal ? 6 : 4, 0, Math.PI * 2);
    ctx.fill();

    // Node Static Border
    if (isActive) {
       ctx.strokeStyle = color;
       ctx.lineWidth = 1;
       ctx.beginPath();
       ctx.arc(x, y, isLocal ? 10 : 8, 0, Math.PI * 2);
       ctx.stroke();
    }

    // Node Label
    ctx.fillStyle = 'white';
    ctx.font = '900 10px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(label.toUpperCase(), x, y + 25);
    
    // Status Tag
    ctx.fillStyle = isActive ? 'hsla(var(--success-h), 100%, 50%, 0.4)' : 'rgba(255,255,255,0.2)';
    ctx.font = '700 7px JetBrains Mono';
    ctx.fillText(status.toUpperCase(), x, y + 35);
  }
}

customElements.define('mesh-graph', MeshGraph);
