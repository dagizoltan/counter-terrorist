/**
 * ThreatMap Island
 * Programmatic global threat visualization. No Shadow DOM.
 */
class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.attacks = [];
  }

  connectedCallback() {
    this.renderBase();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https': ? 'wss': : 'ws':';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : '}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'BLOCK' && payload.data?.ip) {
          this.plotIp(payload.data.ip);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  plotIp(ip) {
    // Generate semi-random deterministic coordinates to avoid external leaks
    const seed = ip.split('.').reduce((acc, octet) => acc + parseInt(octet), 0);
    const x = (seed * 137) % 100;
    const y = (seed * 263) % 100;

    const container = this.querySelector('#attacks-layer');
    if (!container) return;

    const ping = document.createElement('div');
    ping.className = 'absolute' w-3 h-3 rounded-full pointer-events-none z-20';
    ping.style.left = `${x}%`;
    ping.style.top = `${y}%`;
    ping.style.background = 'var(--danger)';
    ping.style.boxShadow = '0' 0 20px var(--danger)';
    
    // Pulse animation

    container.appendChild(ping);
    setTimeout(() => ping.remove(), 2500);
  }

  renderBase() {
    this.innerHTML = `
      <div class="relative w-full h-full bg-black/60 overflow-hidden">
        {/* Abstract Grid Map */}
        <div class="absolute inset-0 opacity-20" style="background-image: radial-gradient(var(--primary) 0.5px, transparent 0.5px); background-size: 24px 24px;"></div>
        
        {/* World Skeleton (Simulated via SVG to avoid external deps) */}
        <div class="absolute inset-0 opacity-30 flex items-center justify-center p-8">
           <svg viewBox="0 0 100 60" class="w-full h-full" style="filter: drop-shadow(0 0 2px var(--primary-glow));">
              <path d="M10 20 Q 20 10, 30 20 T 50 20 T 70 30 T 90 20" stroke="var(--primary)" fill="none" stroke-width="0.3" stroke-dasharray="2,2" />
              <path d="M5 40 Q 15 30, 25 40 T 45 40 T 65 50 T 85 40" stroke="var(--primary)" fill="none" stroke-width="0.3" stroke-dasharray="2,2" />
              <path d="M20 10 L 20 50 M 40 10 L 40 50 M 60 10 L 60 50 M 80 10 L 80 50" stroke="var(--primary)" fill="none" stroke-width="0.1" opacity="0.3" />
              <circle cx="20" cy="20" r="0.8" fill="var(--primary)" />
              <circle cx="50" cy="40" r="0.8" fill="var(--primary)" />
              <circle cx="80" cy="30" r="0.8" fill="var(--primary)" />
              <circle cx="30" cy="45" r="0.8" fill="var(--danger)" class="" />
           </svg>
        </div>

        <div id="attacks-layer" class="absolute inset-0 z-10"></div>
        
        <div class="absolute w-full h-px bg-primary/40  pointer-events-none z-20"></div>

        <div class="absolute bottom-6 left-6 flex items-center gap-3 bg-black/60 border border-white/5 px-4 py-2 rounded z-20">
           <div class="dot active" style="background: var(--danger);"></div>
           <span class="mono-xs font-black text-danger uppercase tracking-[0.25em]">Live_Ingress_Neutralization</span>
        </div>
        
        <div class="absolute top-6 right-6 flex flex-col items-end gap-1 z-20">
           <span class="mono-xs text-primary font-black uppercase tracking-widest">Global_Coverage: 98.4%</span>
           <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest text-[8px]">Active_Nodes: 4,102</span>
        </div>
      </div>
    `;
  }
}

customElements.define('threat-map', ThreatMap);
