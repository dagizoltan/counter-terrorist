export class HoneypotChart extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.data = [];
  }

  connectedCallback() {
    this.render();
    this.fetchData();
    this.interval = setInterval(() => this.fetchData(), 10000);
  }

  disconnectedCallback() {
    clearInterval(this.interval);
  }

  async fetchData() {
    try {
      const res = await fetch('/api/stats/honeypot');
      this.data = await res.json();
      this.updateChart();
    } catch (e) {
      console.error('Failed to fetch honeypot stats:', e);
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; background: transparent; padding: 0; position: relative; }
        canvas { width: 100%; height: 100%; }
        .title { position: absolute; top: -30px; left: 0; font-size: 9px; color: #475569; font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em; }
        .value { position: absolute; top: 0; left: 0; font-size: 24px; color: #fff; font-weight: 900; font-family: 'Inter', sans-serif; }
      </style>
      <div class="value" id="total-hits">0</div>
      <canvas id="chart"></canvas>
    `;
    this.canvas = this.shadowRoot.getElementById('chart');
    this.ctx = this.canvas.getContext('2d');
  }

  updateChart() {
    const total = this.data.reduce((acc, curr) => acc + curr.hits, 0);
    this.shadowRoot.getElementById('total-hits').textContent = total;

    const width = this.canvas.width = this.canvas.clientWidth;
    const height = this.canvas.height = this.canvas.clientHeight;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    if (this.data.length < 2) return;

    const maxHits = Math.max(...this.data.map(d => d.hits), 1);
    const padding = 20;
    const stepX = width / (this.data.length - 1);
    
    // Draw Area
    ctx.beginPath();
    ctx.moveTo(0, height);
    this.data.forEach((d, i) => {
      const x = i * stepX;
      const y = height - (d.hits / maxHits) * (height - padding);
      ctx.lineTo(x, y);
    });
    ctx.lineTo(width, height);
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Line
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    this.data.forEach((d, i) => {
      const x = i * stepX;
      const y = height - (d.hits / maxHits) * (height - padding);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}

customElements.define('honeypot-chart', HoneypotChart);
