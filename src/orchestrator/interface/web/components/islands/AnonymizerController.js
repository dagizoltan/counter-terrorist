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
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${globalThis.location.host}/api/ws/events`);
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) {
        url.searchParams.set('token', csrfToken);
    }
    const ws = new SharedWebSocket(url.toString());

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if ((payload.type === 'METRICS_UPDATE' || (payload.type === 'DEBUG' && payload.subType === 'METRICS_UPDATE')) && payload.data?.vpn) {
          const vpn = payload.data.vpn;
          this.updateState(vpn.mode);
          
          // Update external metric cards if they exist
          const protocolEl = document.getElementById('vpn-protocol');
          const regionEl = document.getElementById('vpn-region');
          const statusEl = document.getElementById('vpn-status');
          const rotationEl = document.getElementById('vpn-rotation');

          if (protocolEl && vpn.currentNode) protocolEl.textContent = vpn.currentNode.protocol || 'WIREGUARD';
          if (regionEl && vpn.currentNode) regionEl.textContent = vpn.currentNode.country || 'GLOBAL';
          if (statusEl) statusEl.textContent = vpn.mode === 'OFF' ? 'DIRECT' : (vpn.mode === 'TOR' ? 'CRITICAL' : 'OPTIMAL');
          if (rotationEl) rotationEl.textContent = vpn.rotations > 0 ? `${vpn.rotations} ROTATIONS` : 'INITIALIZING';
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
           ${[
             { id: 'OFF', label: 'DIRECT_STACK', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M2 12h20"/></svg>' },
             { id: 'TRADITIONAL', label: 'AES_ENCRYPTED', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
             { id: 'VPNGATE', label: 'MESH_EXIT', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
             { id: 'TOR', label: 'ONION_ROUTED', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' }
           ].map(mode => `
             <button 
               data-mode="${mode.id}"
               class="mode-btn group relative flex flex-col items-center justify-center p-6 rounded-2xl border border-white/5 bg-black/40 hover:bg-white/[0.03] transition-all"
             >
                <div class="p-3 mb-3 bg-white/5 rounded-xl border border-white/5 text-slate-500 group-hover:text-white transition-colors">
                   ${mode.icon}
                </div>
                <div class="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2">${mode.label}</div>
                <div class="w-1.5 h-1.5 rounded-full bg-slate-800 indicator transition-all"></div>
             </button>
           `).join('')}
        </div>
 
        <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden shadow-inner">
           <header class="px-6 py-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
              <div class="flex items-center gap-3">
                 <div class="w-1 h-3 bg-primary rounded-full"></div>
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Operation_Log</span>
              </div>
              <div class="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
           </header>
           <div id="anon-logs" class="h-48 overflow-y-auto custom-scrollbar p-6 space-y-3">
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
