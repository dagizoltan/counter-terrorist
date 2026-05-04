/**
 * HoneypotChart Island
 * Tactical deception volume visualization. No Shadow DOM.
 */
class HoneypotChart extends HTMLElement {
  constructor() {
    super();
    this.data = [];
  }

  connectedCallback() {
    this.renderBase();
    this.canvas = this.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.fetchData();
    this.interval = setInterval(() => this.fetchData(), 20000);
    
    // Resize handler with debounce
    let resizeTimer;
    window.addEventListener('resize', () => {
       clearTimeout(resizeTimer);
       resizeTimer = setTimeout(() => this.updateChart(), 250);
    });
  }

  disconnectedCallback() {
    clearInterval(this._interval);
  }

  async fetchData() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/stats/honeypot', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      const data = await res.json();
      if (data && data.length > 0) {
        this.data = data;
        this.updateChart();
      }
    } catch (e) {}
  }

  renderBase() {
    this.innerHTML = `
      <div class="relative w-full h-full flex flex-col">
        <div class="flex justify-between items-start mb-10">
           <div class="flex flex-col gap-2">
              <span class="mono-xs text-slate-700 uppercase tracking-[0.3em] font-black">Total_Adversary_Hits</span>
              <div class="flex items-baseline gap-4">
                 <span id="total-hits" class="mono-lg font-black text-white tracking-widest tabular-nums leading-none">0</span>
                 <span class="status-pill warning'}>+2.4%</span>
              </div>
           </div>
           <div class="flex items-center gap-4 bg-warning/5 border border-warning/20 px-5 py-2.5 rounded-full">
              <span class="dot danger'}></span>
              <span class="mono-xs font-black text-warning uppercase tracking-[0.2em]">DECEPTION_FEED_ACTIVE</span>
           </div>
        </div>
        <div class="flex-grow relative min-h-[200px] bg-black/20 rounded-lg border border-white/5 p-4 overflow-hidden">
           <div class="absolute inset-0 pointer-events-none opacity-5" style="background-image: linear-gradient(0deg, var(--warning) 1px, transparent 1px), linear-gradient(90deg, var(--warning) 1px, transparent 1px); background-size: 40px 40px;"></div>
           <canvas class="w-full h-full relative z-10"></canvas>
        </div>
        <div class="mt-8 flex justify-between items-center opacity-40 border-t border-white/5 pt-6">
           <div class="flex items-center gap-3">
              <span class="mono-xs font-bold text-slate-600 uppercase tracking-widest">TEMPORAL_WINDOW: 24H_CYCLE</span>
           </div>
           <span class="mono-xs font-bold text-slate-600 uppercase tracking-widest">SOURCE: DISTRIBUTED_HONEYNET_V4</span>
        </div>
      </div>
    `;
  }

  updateChart() {
    if (!this.data || this.data.length === 0) return;

    const total = this.data.reduce((acc, curr) => acc + curr.hits, 0);
    const totalEl = this.querySelector('#total-hits');
    if (totalEl) totalEl.textContent = total;

    const width = this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
    const height = this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const drawWidth = this.canvas.clientWidth;
    const drawHeight = this.canvas.clientHeight;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, drawWidth, drawHeight);

    if (this.data.length < 2) return;

    const maxHits = Math.max(...this.data.map(d => d.hits), 1);
    const padding = 30;
    const stepX = drawWidth / (this.data.length - 1);
    
    // Draw Tactical Grid lines (Horizontal)
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
       const y = padding + (drawHeight - padding * 2) * (i / 4);
       ctx.moveTo(0, y);
       ctx.lineTo(drawWidth, y);
    }
    ctx.stroke();

    // Draw Area Gradient
    ctx.beginPath();
    ctx.moveTo(0, drawHeight);
    this.data.forEach((d, i) => {
      const x = i * stepX;
      const y = drawHeight - padding - (d.hits / maxHits) * (drawHeight - padding * 2);
      if (i === 0) ctx.lineTo(x, y);
      else {
        // Curve smoothing
        const prevX = (i - 1) * stepX;
        const prevY = drawHeight - padding - (this.data[i-1].hits / maxHits) * (drawHeight - padding * 2);
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    });
    ctx.lineTo(drawWidth, drawHeight);
    const grad = ctx.createLinearGradient(0, 0, 0, drawHeight);
    grad.addColorStop(0, 'hsla(var(--warning-h), var(--warning-s), 40%, 0.15)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Line with Glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'var(--warning-glow)';
    ctx.beginPath();
    ctx.strokeStyle = 'var(--warning)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.data.forEach((d, i) => {
      const x = i * stepX;
      const y = drawHeight - padding - (d.hits / maxHits) * (drawHeight - padding * 2);
      if (i === 0) ctx.moveTo(x, y);
      else {
        const prevX = (i - 1) * stepX;
        const prevY = drawHeight - padding - (this.data[i-1].hits / maxHits) * (drawHeight - padding * 2);
        const cpX = (prevX + x) / 2;
        ctx.bezierCurveTo(cpX, prevY, cpX, y, x, y);
      }
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw Data Points (interactive' feel)
    this.data.forEach((d, i) => {
      if (i % 2 !== 0) return; // Only draw some points for clarity
      const x = i * stepX;
      const y = drawHeight - padding - (d.hits / maxHits) * (drawHeight - padding * 2);
      
      ctx.beginPath();
      ctx.fillStyle = 'var(--bg)';
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.beginPath();
      ctx.strokeStyle = 'var(--warning)';
      ctx.lineWidth = 2;
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = 'var(--warning)';
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

customElements.define('honeypot-chart', HoneypotChart);
