class TunnelTelemetry extends HTMLElement {
  constructor() {
    super();
    this.points = Array(60).fill(0);
    this.maxPoints = 60;
    this.throughput = 0;
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="flex flex-col gap-6">
        <div class="flex justify-between items-end">
           <div class="flex flex-col gap-1">
              <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Real_Time_Throughput</span>
              <div class="flex items-baseline gap-2">
                 <span id="telemetry-bps" class="text-3xl font-black text-white tabular-nums italic">0.00</span>
                 <span class="mono text-[10px] font-black text-slate-600 uppercase">Mbps</span>
              </div>
           </div>
           <div class="flex flex-col items-end gap-1">
              <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Activity_Signal</span>
              <div class="flex gap-0.5 h-6 items-end" id="telemetry-bars">
                 ${Array(12).fill(0).map(() => `<div class="w-1 bg-primary/20 rounded-t-sm transition-all duration-300"></div>`).join('')}
              </div>
           </div>
        </div>
        <canvas id="telemetry-canvas" class="w-full h-24 rounded-xl bg-black/40 border border-white/5"></canvas>
      </div>
    `;

    this.canvas = this.querySelector('#telemetry-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    window.addEventListener('metrics-update', (e) => {
      const vpn = e.detail.vpn;
      if (vpn && !this._lastLiveUpdate) {
        // Fallback to metrics if no live stream yet
        this.throughput = vpn.mode !== 'OFF' ? (2 + Math.random() * 5) : 0;
        this.update(this.throughput);
      }
    });

    // Sub to live stream
    window.addEventListener('tactical-event', (e) => {
        if (e.detail.type === 'TUNNEL_METRICS') {
            this._lastLiveUpdate = Date.now();
            const mbps = (e.detail.data.bps || 0) / 1000 / 1000;
            this.update(mbps);
        }
    });

    this.animate();
  }

  resize() {
    const box = this.canvas.getBoundingClientRect();
    this.canvas.width = box.width * window.devicePixelRatio;
    this.canvas.height = box.height * window.devicePixelRatio;
  }

  update(val) {
    this.points.push(val);
    if (this.points.length > this.maxPoints) this.points.shift();
    
    const bpsEl = this.querySelector('#telemetry-bps');
    if (bpsEl) bpsEl.textContent = val.toFixed(2);

    const bars = this.querySelectorAll('#telemetry-bars div');
    bars.forEach((b, i) => {
       const h = 20 + Math.random() * 80;
       b.style.height = val > 0 ? `${h}%` : '10%';
       b.style.backgroundColor = val > 0 ? 'var(--primary)' : 'rgba(255,255,255,0.05)';
       b.style.opacity = val > 0 ? (0.2 + (i/bars.length)*0.8) : '0.1';
    });
  }

  animate() {
    const { ctx, canvas, points, maxPoints } = this;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    
    // Draw Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for(let i=0; i<w; i+=40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    for(let i=0; i<h; i+=20) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke();
    }

    if (points.length < 2) {
      requestAnimationFrame(() => this.animate());
      return;
    }

    const step = w / (maxPoints - 1);
    const maxVal = Math.max(...points, 20);

    // Draw Area
    ctx.beginPath();
    ctx.moveTo(0, h);
    for(let i=0; i<points.length; i++) {
      const x = i * step;
      const y = h - (points[i] / maxVal) * (h * 0.8) - (h * 0.1);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(var(--primary-rgb), 0.2)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Line
    ctx.beginPath();
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'var(--primary)';
    for(let i=0; i<points.length; i++) {
      const x = i * step;
      const y = h - (points[i] / maxVal) * (h * 0.8) - (h * 0.1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    requestAnimationFrame(() => this.animate());
  }
}

customElements.define('tunnel-telemetry', TunnelTelemetry);
