class AnonymizerController extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
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
        if (payload.type === 'ANONYMIZER_LOG' || payload.type === 'ANONYMIZER_UPDATE') {
          this.addLog(payload);
        }
      } catch (e) {}
    };
  }

  addLog(entry) {
    this.logs.unshift({
      timestamp: entry.timestamp || new Date().toISOString(),
      message: entry.message || entry.data?.message || 'Identity rotated',
      severity: entry.severity || 'info'
    });
    if (this.logs.length > 50) this.logs.pop();
    this.renderLogs();
  }

  render() {
    this.innerHTML = `
      <div class="space-y-6">
        <div class="grid grid-cols-2 gap-4">
           ${['TRADITIONAL', 'VPNGATE', 'TOR', 'OFF'].map(mode => `
             <button 
               data-mode="${mode}"
               class="mode-btn group relative flex flex-col items-center justify-center p-6 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-all"
             >
                <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">${mode}</div>
                <div class="w-2 h-2 rounded-full bg-slate-700 indicator transition-all"></div>
             </button>
           `).join('')}
        </div>

        <div class="bg-black/40 border border-white/5 rounded-2xl overflow-hidden">
           <header class="px-6 py-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
              <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Operation_Log</span>
              <div class="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
           </header>
           <div id="anon-logs" class="h-48 overflow-y-auto custom-scrollbar p-4 space-y-2">
              <div class="text-center py-10 opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Awaiting_Identity_Logs...</div>
           </div>
        </div>
      </div>
    `;

    this.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
    this.renderLogs();
  }

  renderLogs() {
    const container = document.getElementById('anon-logs');
    if (!container || this.logs.length === 0) return;

    container.innerHTML = this.logs.map(log => `
      <div class="flex gap-4 items-start animate-in fade-in slide-in-from-left-2 duration-300">
        <span class="mono-xs text-slate-600 font-bold shrink-0">${new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
        <span class="mono-xs font-bold text-slate-400 uppercase tracking-tight">${log.message}</span>
      </div>
    `).join('');
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
