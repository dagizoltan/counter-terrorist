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
               id="mode-${mode}"
               onclick="window.setStealthMode('${mode}')"
               class="mode-btn group relative flex flex-col items-center justify-center p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all"
             >
                <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1 group-hover:text-white transition-colors">${mode}</div>
                <div class="w-1.5 h-1.5 rounded-full bg-slate-700 transition-all indicator"></div>
             </button>
           `).join('')}
        </div>
      </div>
    `;

    window.setStealthMode = async (mode) => {
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
        console.log(`Stealth mode set to ${mode}`);
      }
    };
  }

  updateState(activeMode) {
    this.querySelectorAll('.mode-btn').forEach(btn => {
      const mode = btn.id.replace('mode-', '');
      const indicator = btn.querySelector('.indicator');
      if (mode === activeMode) {
        btn.classList.add('border-cyber/40', 'bg-cyber/10');
        indicator.classList.add('bg-cyber', 'shadow-[0_0_10px_rgba(0,210,255,0.8)]', 'scale-150');
        btn.querySelector('div').classList.add('text-cyber');
      } else {
        btn.classList.remove('border-cyber/40', 'bg-cyber/10');
        indicator.classList.remove('bg-cyber', 'shadow-[0_0_10px_rgba(0,210,255,0.8)]', 'scale-150');
        btn.querySelector('div').classList.remove('text-cyber');
      }
    });
  }
}

customElements.define('anonymizer-controller', AnonymizerController);
