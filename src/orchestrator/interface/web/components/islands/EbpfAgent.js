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
        
        <div class="col-span-12 lg:col-span-9 space-y-6">
           <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
              <header class="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
                 <h3 class="tactical-title text-base tracking-widest">KERNEL_EVENT_STREAM</h3>
                 <div class="status-pill primary">LIVE_AUDIT</div>
              </header>
              <div id="ebpf-event-log" class="h-[400px] overflow-y-auto custom-scrollbar">
                 <div class="p-12 text-center opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Listening_For_Syscalls...</div>
              </div>
           </div>
 
           <div class="t-panel glass-panel p-0 border-t-2 border-danger/30 overflow-hidden">
              <header class="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
                 <h3 class="tactical-title text-base tracking-widest">KERNEL_EVENT_LEDGER</h3>
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Persistent Forensic Trail</span>
              </header>
              <div class="overflow-x-auto">
                 <table class="w-full text-left">
                    <thead class="bg-black/20 border-b border-white/5">
                       <tr>
                          <th class="p-4 mono-xs text-slate-500 font-black uppercase">Timestamp</th>
                          <th class="p-4 mono-xs text-slate-500 font-black uppercase">Type</th>
                          <th class="p-4 mono-xs text-slate-500 font-black uppercase">Source</th>
                          <th class="p-4 mono-xs text-slate-500 font-black uppercase">Message</th>
                          <th class="p-4 mono-xs text-slate-500 font-black uppercase text-right">Action</th>
                       </tr>
                    </thead>
                    <tbody id="ebpf-ledger-body" class="divide-y divide-white/5">
                       <tr>
                          <td colspan="5" class="p-12 text-center opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Awaiting_Forensic_Data...</td>
                       </tr>
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      </div>
    `;
    this.fetchStatus();
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const type = payload.type || '';
        if (type.startsWith('EBPF_') || type === 'DRIFT_PROCESS' || type === 'THREAT') {
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
    const logEntry = { ...event, _id: crypto.randomUUID() };
    this.logs.unshift(logEntry);
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
        interceptedEl.classList.add('pulse');
        setTimeout(() => interceptedEl.classList.remove('pulse'), 500);
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
      const res = await fetch('/api/defense/purge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CT-Token': csrfToken } : {})
        },
        body: JSON.stringify({ pid })
      });
      if (res.ok) {
        alert("Purge sequence initiated.");
      } else {
        alert("Purge failed: Access Denied");
      }
    } catch (e) {
      alert("Purge failed: " + e.message);
    }
  }

  renderLogs() {
    const container = document.getElementById('ebpf-event-log');
    const ledger = document.getElementById('ebpf-ledger-body');
    if (!container || !ledger) return;
 
    if (this.logs.length === 0) {
      container.innerHTML = `
        <div class="p-12 space-y-6">
           <div class="h-16 w-full bg-white/5 animate-pulse rounded-lg"></div>
           <div class="h-16 w-full bg-white/5 animate-pulse rounded-lg opacity-60"></div>
           <div class="h-16 w-full bg-white/5 animate-pulse rounded-lg opacity-30"></div>
        </div>
      `;
      return;
    }
 
    // Live Stream: Detailed per-event telemetry
    container.innerHTML = this.logs.map(log => {
      const isCritical = log.type === 'DRIFT_PROCESS' || log.type === 'EBPF_CRITICAL' || log.message?.toLowerCase().includes('unauthorized');
      const pid = log.data?.pid || log.data?.target_pid || '';
      const typeLabel = (log.type || '').replace('EBPF_', '');
 
      return `
        <div class="p-6 border-b border-white/[0.03] hover:bg-white/[0.02] group relative transition-colors" 
             style="border-left: 4px solid ${isCritical ? 'var(--danger)' : 'transparent'}">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-3">
                <span class="status-pill ${isCritical ? 'danger' : 'neutral'} text-[8px]">
                  ${window.escapeHTML(typeLabel)}
                </span>
                <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest text-[9px]">Syscall_Intercept</span>
             </div>
             <span class="mono-xs text-slate-600 font-bold">${new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          </div>
          <div class="mono-sm font-bold ${isCritical ? 'text-danger' : 'text-slate-400'} uppercase tracking-tight leading-tight mb-3">
            ${window.escapeHTML(log.message)}
          </div>
          ${isCritical && pid ? `
            <div class="flex gap-4">
               <button data-purge-pid="${window.escapeHTML(pid)}" class="t-btn danger !py-1 !px-3 text-[8px] font-black uppercase tracking-widest rounded transition-colors">PURGE_PID_${pid}</button>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
 
    // Ledger Table: Forensic summary of only CRITICAL/DRIFT events to avoid duplication
    const forensicLogs = this.logs.filter(log => log.type === 'DRIFT_PROCESS' || log.type === 'EBPF_CRITICAL' || log.message?.toLowerCase().includes('unauthorized'));
    
    if (forensicLogs.length === 0) {
      ledger.innerHTML = `<tr><td colspan="5" class="p-12 text-center opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Listening_For_Critical_Violations...</td></tr>`;
    } else {
      ledger.innerHTML = forensicLogs.map(log => {
         const pid = log.data?.pid || log.data?.target_pid || 'N/A';
         const typeLabel = (log.type || '').replace('EBPF_', '');
         const isCritical = log.type === 'DRIFT_PROCESS' || log.type === 'EBPF_CRITICAL';
   
         return `
           <tr class="hover:bg-white/[0.02] transition-colors">
              <td class="p-4 mono-xs text-slate-500 font-bold">${new Date(log.timestamp).toLocaleTimeString()}</td>
              <td class="p-4">
                 <span class="status-pill ${isCritical ? 'danger' : 'neutral'} !px-3 !py-0.5 text-[8px]">
                    ${window.escapeHTML(typeLabel)}
                 </span>
              </td>
              <td class="p-4 mono-xs text-slate-400 font-black">PID: ${pid}</td>
              <td class="p-4 mono-xs text-slate-300 font-bold uppercase tracking-tight truncate max-w-[200px]">${window.escapeHTML(log.message)}</td>
              <td class="p-4 text-right">
                 ${pid !== 'N/A' ? `
                   <button data-purge-pid="${window.escapeHTML(pid)}" class="mono-xs text-danger hover:text-white transition-colors uppercase font-black">PURGE</button>
                 ` : '---'}
              </td>
           </tr>
         `;
      }).join('');
    }
 
    if (!this._clickHandler) {
      this._clickHandler = (e) => {
         const btn = e.target.closest('[data-purge-pid]');
         if (btn) this.handlePurge(btn.getAttribute('data-purge-pid'));
      };
      this.addEventListener('click', this._clickHandler);
    }
  }

  render() {
    this.renderLogs();
  }
}

customElements.define('ebpf-agent', EbpfAgent);
