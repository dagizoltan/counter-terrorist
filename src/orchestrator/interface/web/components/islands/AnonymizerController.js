class AnonymizerController extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);
    const ws = new WebSocket(url.toString());

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'METRICS_UPDATE' && payload.data?.vpn) {
          this.updateState(payload.data.vpn.mode);
        }
      } catch (e) {}
    };
  }

  render() {
    this.innerHTML = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
           ${['TRADITIONAL', 'VPNGATE', 'TOR', 'OFF'].map(mode => `
             <button 
               data-mode="${mode}"
               class="mode-btn group relative flex flex-col items-center justify-center p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all"
             >
                <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-white transition-colors">${mode}</div>
                <div class="w-1.5 h-1.5 rounded-full bg-slate-700 transition-all indicator"></div>
             </button>
           `).join('')}
        </div>
      </div>
    `;

    this.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
  }

  async setMode(mode) {
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const res = await fetch('/api/network/mode', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-CT-Token': csrfToken
      },
      body: JSON.stringify({ mode })
    });
    if (res.ok) {
        // UI feedback handled by WS update
    }
  }

  updateState(activeMode) {
    this.querySelectorAll('.mode-btn').forEach(btn => {
      const mode = btn.dataset.mode;
      const indicator = btn.querySelector('.indicator');
      if (mode === activeMode) {
        btn.classList.add('border-primary/40', 'bg-primary/10');
        indicator.classList.add('bg-primary', 'shadow-[0_0_10px_var(--primary-glow)]', 'scale-150');
        btn.querySelector('div').classList.add('text-primary');
      } else {
        btn.classList.remove('border-primary/40', 'bg-primary/10');
        indicator.classList.remove('bg-primary', 'shadow-[0_0_10px_var(--primary-glow)]', 'scale-150');
        btn.querySelector('div').classList.remove('text-primary');
      }
    });
  }
}

customElements.define('anonymizer-controller', AnonymizerController);
