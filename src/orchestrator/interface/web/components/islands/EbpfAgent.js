/**
 * Custom Element: EbpfAgent
 * Kernel-level security guardian monitoring syscalls and process drifts.
 */
class EbpfAgent extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
    this.stats = {
      intercepted: 0,
      blocked: 0,
      drifts: 0
    };
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="grid grid-cols-12 gap-6">
        <div class="col-span-12 lg:col-span-3 space-y-6">
           <div class="p-8 bg-black/40 border border-white/5 rounded-2xl">
              <div class="flex justify-between items-center mb-6">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Guardian_Status</span>
                 <div id="ebpf-status-dot" class="dot"></div>
              </div>
              <div id="ebpf-status-label" class="mono-sm font-black text-white uppercase tracking-widest italic">Awaiting_Sync...</div>
           </div>
           
           <div class="p-8 bg-black/40 border border-white/5 rounded-2xl">
              <div class="mono-xs text-slate-500 font-black uppercase tracking-widest mb-6">Intercepts</div>
              <div id="ebpf-stat-intercepted" class="text-5xl font-black text-white tabular-nums italic">0000</div>
           </div>

           <div class="p-8 bg-black/40 border border-white/5 rounded-2xl">
              <div class="mono-xs text-slate-500 font-black uppercase tracking-widest mb-6">Anomalies</div>
              <div id="ebpf-stat-drifts" class="text-5xl font-black text-white tabular-nums italic">00</div>
           </div>
        </div>
        
        <div class="col-span-12 lg:col-span-9">
           <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
              <header class="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
                 <h3 class="tactical-title text-base tracking-widest">KERNEL_EVENT_STREAM</h3>
                 <div class="status-pill primary">LIVE_AUDIT</div>
              </header>
              <div id="ebpf-event-log" class="h-[600px] overflow-y-auto custom-scrollbar">
                 <div class="p-12 text-center opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Listening_For_Syscalls...</div>
              </div>
           </div>
        </div>
      </div>
    `;
    this.fetchStatus();
    this.connectWS();
    this.render();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type?.startsWith('EBPF_') || payload.type === 'DRIFT_PROCESS') {
          this.addEvent(payload);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connectWS(), 5000);
  }

  async fetchStatus() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/agent/status', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login";
        return;
      }

      const data = await res.json();
      const ebpf = data.ebpf;

      const statusLabel = document.getElementById('ebpf-status-label');
      const statusDot = document.getElementById('ebpf-status-dot');
      
      if (ebpf?.active) {
        if (statusLabel) statusLabel.textContent = 'Kernel_Guardian_Active';
        if (statusDot) {
          statusDot.className = 'dot active';
          statusDot.style.background = 'var(--success)';
        }
      } else {
        if (statusLabel) statusLabel.textContent = 'Guardian_Offline';
        if (statusDot) {
          statusDot.className = 'dot';
          statusDot.style.background = '#1e293b';
        }
      }
    } catch (e) {}
  }

  addEvent(event) {
    this.logs.unshift(event);
    if (this.logs.length > 100) this.logs.pop();
    
    // Update stats
    this.stats.intercepted++;
    if (event.type === 'DRIFT_PROCESS') this.stats.drifts++;
    if (event.message?.toLowerCase().includes('block')) this.stats.blocked++;

    this.renderLogs();
    this.renderStats();
  }

  renderStats() {
    const interceptedEl = document.getElementById('ebpf-stat-intercepted');
    const driftEl = document.getElementById('ebpf-stat-drifts');
    if (interceptedEl) {
        interceptedEl.textContent = this.stats.intercepted.toString().padStart(4, '0');
        interceptedEl.classList.add('');
        setTimeout(() => interceptedEl.classList.remove(''), 500);
    }
    if (driftEl) {
        driftEl.textContent = this.stats.drifts.toString().padStart(2, '0');
        if (this.stats.drifts > 0) driftEl.classList.add('text-danger');
    }
  }

  async handlePurge(pid) {
    if (!pid) return;
    if (!confirm(`INITIATE_PURGE for PID ${pid}? This will terminate the process tree.`)) return;
    
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      await fetch('/api/defense/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CT-Token': csrfToken } : {})
        },
        body: JSON.stringify({ pid })
      });
      alert("Purge sequence initiated.");
    } catch (e) {
      alert("Purge failed: " + e.message);
    }
  }

  renderLogs() {
    const container = document.getElementById('ebpf-event-log');
    if (!container) return;

    if (this.logs.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col gap-6">
           <div class="skeleton h-16 w-full"></div>
           <div class="skeleton h-16 w-full opacity-60"></div>
           <div class="skeleton h-16 w-full opacity-30"></div>
        </div>
      `;
      return;
    }

    // Standardize event handling
    this.removeEventListener('click', this._clickHandler);
    this._clickHandler = (e) => {
       const btn = e.target.closest('[data-purge-pid]');
       if (btn) this.handlePurge(btn.getAttribute('data-purge-pid'));
    };
    this.addEventListener('click', this._clickHandler);

    container.innerHTML = this.logs.map(log => {
      const isCritical = log.type === 'DRIFT_PROCESS' || log.message?.toLowerCase().includes('unauthorized');
      const pid = log.data?.pid || log.data?.target_pid;
      const typeLabel = log.type.replace('EBPF_', '');

      return `
        <div class="p-8 border-b border-white/[0.03] hover:bg-white/[0.02]  group relative" 
             style="border-left: 4px solid ${isCritical ? 'var(--danger)' : 'transparent'}">
          <div class="flex justify-between items-center mb-4 relative z-10">
             <div class="flex items-center gap-4">
                <span class="status-pill ${isCritical ? 'danger' : 'primary'}">
                  ${typeLabel}
                </span>
                <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Syscall_Intercept</span>
             </div>
             <span class="mono-xs text-slate-600 font-bold">${new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          </div>
          <div class="flex items-start gap-4 relative z-10">
             <div class="mono-sm font-bold ${isCritical ? 'text-danger' : 'text-slate-400'} uppercase tracking-tight leading-relaxed">
               ${window.escapeHTML(log.message)}
             </div>
          </div>
          ${isCritical ? `
            <div class="mt-6 flex gap-4 relative z-10">
               <div class="status-pill danger'}>POLICY_VIOLATION</div>
               <button data-purge-pid="${pid}" class="t-btn danger px-4 py-2">PURGE_PROCESS</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  render() {
    this.renderLogs();
  }
}

customElements.define('ebpf-agent', EbpfAgent);
