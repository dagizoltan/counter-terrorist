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
    const ws = new SharedWebSocket();

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if ((payload.type === 'METRICS_UPDATE' || (payload.type === 'DEBUG' && payload.subType === 'METRICS_UPDATE')) && payload.data?.vpn) {
          const vpn = payload.data.vpn;
          this.updateState(vpn.mode);
          
          // Status readouts, rendered by this island (see render()).
          const protocolEl = this.querySelector('#vpn-protocol');
          const regionEl = this.querySelector('#vpn-region');
          const statusEl = this.querySelector('#vpn-status');
          const rotationEl = this.querySelector('#vpn-rotation');

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
      <div class="space-y-4">
        <div class="stat-grid">
           <div class="stat-cell">
              <span class="eyebrow">Protocol</span>
              <span class="stat-cell__value" id="vpn-protocol">—</span>
           </div>
           <div class="stat-cell">
              <span class="eyebrow">Region</span>
              <span class="stat-cell__value" id="vpn-region">—</span>
           </div>
           <div class="stat-cell">
              <span class="eyebrow">Status</span>
              <span class="stat-cell__value" id="vpn-status">—</span>
           </div>
           <div class="stat-cell">
              <span class="eyebrow">Rotation</span>
              <span class="stat-cell__value" id="vpn-rotation">—</span>
           </div>
        </div>

        <div class="grid grid-cols-2 gap-4">
           ${[
             { id: 'OFF', label: 'DIRECT_STACK', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M2 12h20"/></svg>' },
             { id: 'TRADITIONAL', label: 'AES_ENCRYPTED', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>' },
             { id: 'VPNGATE', label: 'MESH_EXIT', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
             { id: 'TOR', label: 'ONION_ROUTED', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>' }
           ].map(mode => `
             <button 
               data-mode="${mode.id}"
               class="mode-btn group relative flex flex-col items-center justify-center p-4 rounded-lg border border-white/5 bg-black/40 hover:bg-white/[0.03] transition-all"
             >
                <div class="p-3 mb-3 bg-white/5 rounded-lg border border-white/5 text-slate-500 group-hover:text-white transition-colors">
                   ${mode.icon}
                </div>
                <div class="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-2">${mode.label}</div>
                <div class="w-1.5 h-1.5 rounded-full bg-slate-800 indicator transition-all"></div>
             </button>
           `).join('')}
        </div>
 
        <div class="bg-black/20 border border-white/5 rounded-lg overflow-hidden shadow-inner">
           <header class="px-4 py-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
              <div class="flex items-center gap-3">
                 <div class="w-1 h-3 bg-primary rounded-full"></div>
                 <span class="eyebrow">Operation_Log</span>
              </div>
              <div class="indicator indicator--sm" data-state="info" data-pulse="" aria-hidden="true"></div>
           </header>
           <div id="anon-logs" class="h-48 overflow-y-auto custom-scrollbar p-4 space-y-3">
              <div class="eyebrow text-center py-5 opacity-20">Awaiting_Identity_Logs...</div>
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
    const container = this.querySelector('#anon-logs');
    if (!container || this.logs.length === 0) return;

    // SEC-03: DOM-based XSS Hardening.
    // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
    container.innerHTML = '';
    this.logs.forEach(log => {
      const logEl = document.createElement('div');
      logEl.className = "flex gap-4 items-start animate-in fade-in slide-in-from-left-2 duration-300";

      const timeSpan = document.createElement('span');
      timeSpan.className = "mono-xs text-slate-600 font-bold shrink-0";
      timeSpan.textContent = new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});

      const msgSpan = document.createElement('span');
      msgSpan.className = "mono-xs font-bold text-slate-400 uppercase tracking-tight";
      msgSpan.textContent = log.message;

      logEl.appendChild(timeSpan);
      logEl.appendChild(msgSpan);
      container.appendChild(logEl);
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
