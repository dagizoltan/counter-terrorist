class AnonymizerController extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
    this.activeMode = 'OFF';
  }

  connectedCallback() {
    this.render();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);
    const ws = new SharedWebSocket(url.toString());

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if ((payload.type === 'METRICS_UPDATE' || (payload.type === 'DEBUG' && payload.subType === 'METRICS_UPDATE')) && payload.data?.vpn) {
          const vpn = payload.data.vpn;
          this.updateState(vpn.mode);
          
          // Update external tactical cards
          this.updateTacticalCard('vpn-protocol', vpn.currentNode?.protocol || (vpn.active ? 'WIREGUARD' : 'NONE'));
          this.updateTacticalCard('vpn-region', vpn.currentNode?.country || 'LOCAL_DIRECT');
          
          const statusEl = document.getElementById('vpn-status');
          if (statusEl) {
             const status = vpn.mode === 'OFF' ? 'BYPASSED' : (vpn.mode === 'STUB_FALLBACK' ? 'MOCKED' : (vpn.mode === 'TOR' ? 'CRITICAL' : 'OPTIMAL'));
             statusEl.textContent = status;
             statusEl.classList.remove('text-success', 'text-warning', 'text-danger');
             statusEl.classList.add(status === 'BYPASSED' || status === 'MOCKED' ? 'text-danger' : (status === 'CRITICAL' ? 'text-warning' : 'text-success'));
          }

          const rotationEl = document.getElementById('vpn-rotation');
          if (rotationEl) rotationEl.textContent = vpn.rotations > 0 ? `${vpn.rotations} ROTATIONS` : 'STABLE';
        }
        if (payload.type === 'ANONYMIZER_LOG' || payload.type === 'ANONYMIZER_UPDATE') {
          this.addLog(payload);
        }
      } catch (e) {}
    };
  }

  updateTacticalCard(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value.toUpperCase();
  }

  addLog(entry) {
    const msg = entry.message || entry.data?.message || 'Identity rotation event';
    this.logs.unshift({
      timestamp: entry.timestamp || new Date().toISOString(),
      message: msg,
      severity: entry.severity || (msg.toLowerCase().includes('fail') ? 'danger' : 'info')
    });
    if (this.logs.length > 50) this.logs.pop();
    this.renderLogs();
  }

  render() {
    this.innerHTML = `
      <div class="flex flex-col gap-8">
        <div class="grid grid-cols-2 gap-4">
           ${[
             { id: 'OFF', label: 'BYPASS_DIRECT', theme: 'danger', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M2 12h20"/></svg>' },
             { id: 'TRADITIONAL', label: 'AES_TUNNEL', theme: 'primary', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
             { id: 'VPNGATE', label: 'MESH_EXIT', theme: 'success', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
             { id: 'TOR', label: 'ONION_STEALTH', theme: 'warning', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' }
           ].map(mode => `
             <button 
               data-mode="${mode.id}"
               class="mode-btn group relative flex flex-col items-center justify-center p-8 rounded-3xl border border-white/5 bg-black/40 hover:bg-white/[0.04] transition-all duration-500 overflow-hidden"
             >
                <div class="p-4 mb-4 bg-white/5 rounded-2xl border border-white/5 text-slate-500 group-hover:scale-110 transition-all duration-500">
                   ${mode.icon}
                </div>
                <div class="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4 transition-colors group-hover:text-white">${mode.label}</div>
                <div class="w-2 h-2 rounded-full bg-slate-800 indicator transition-all duration-500"></div>
                <!-- Selection Glow -->
                <div class="absolute inset-x-0 bottom-0 h-1 bg-${mode.theme} opacity-0 selection-bar transition-opacity duration-500"></div>
             </button>
           `).join('')}
        </div>
 
        <div class="t-panel glass-panel p-0 border-t border-white/5 overflow-hidden">
           <header class="px-8 py-5 border-b border-white/5 bg-black/60 flex justify-between items-center">
              <span class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em]">Operational_Status_Ledger</span>
              <div class="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_var(--primary)]"></div>
           </header>
           <div id="anon-logs" class="h-64 overflow-y-auto custom-scrollbar p-8 space-y-4 bg-black/20 font-mono text-[10px]">
              <div class="text-center py-16 opacity-20 mono-xs font-black uppercase tracking-[0.5em]">Awaiting_Telemetry_Broadcast...</div>
           </div>
        </div>
      </div>
    `;

    this.querySelectorAll('.mode-btn').forEach(btn => {
      btn.onclick = () => this.setMode(btn.dataset.mode);
    });
    this.renderLogs();
  }

  renderLogs() {
    const container = document.getElementById('anon-logs');
    if (!container || this.logs.length === 0) return;

    container.innerHTML = this.logs.map(log => `
      <div class="flex gap-4 items-start animate-in fade-in slide-in-from-left-4 duration-500">
        <span class="text-slate-600 shrink-0 font-bold opacity-50">${new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
        <span class="font-bold text-slate-300 uppercase tracking-tight leading-relaxed">${log.message}</span>
      </div>
    `).join('');
  }

  async setMode(mode) {
    if (this.activeMode === mode) return;
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const res = await fetch('/api/network/mode', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-CT-Token': csrfToken
      },
      body: JSON.stringify({ mode })
    });
    if (!res.ok) {
       const err = await res.json();
       alert(`Handshake Failed: ${err.message || 'Unknown protocol error'}`);
    }
  }

  updateState(activeMode) {
    this.activeMode = activeMode;
    this.querySelectorAll('.mode-btn').forEach(btn => {
      const mode = btn.dataset.mode;
      const indicator = btn.querySelector('.indicator');
      const selectionBar = btn.querySelector('.selection-bar');
      const iconBox = btn.querySelector('div');
      
      if (mode === activeMode) {
        btn.classList.add('border-primary/20', 'bg-primary/5');
        indicator.classList.add('bg-primary', 'shadow-[0_0_15px_var(--primary)]', 'scale-150');
        selectionBar.classList.remove('opacity-0');
        iconBox.classList.add('text-primary', 'bg-primary/10', 'border-primary/20');
      } else {
        btn.classList.remove('border-primary/20', 'bg-primary/5');
        indicator.classList.remove('bg-primary', 'shadow-[0_0_15px_var(--primary)]', 'scale-150');
        selectionBar.classList.add('opacity-0');
        iconBox.classList.remove('text-primary', 'bg-primary/10', 'border-primary/20');
      }
    });
  }
}

customElements.define('anonymizer-controller', AnonymizerController);
