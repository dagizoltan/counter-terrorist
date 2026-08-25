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
      <div class="grid grid-cols-12 gap-4">
        <div class="col-span-12 lg:col-span-3 space-y-4">
           <div class="p-4 bg-black/40 border border-white/5 rounded-lg">
              <div class="flex justify-between items-center mb-4">
                 <span class="eyebrow">Guardian_Status</span>
                 <div id="ebpf-status-dot" class="dot"></div>
              </div>
              <div id="ebpf-status-label" class="mono-sm font-black text-white uppercase tracking-widest italic">Awaiting_Sync...</div>
           </div>
           
           <div class="p-4 bg-black/40 border border-white/5 rounded-lg">
              <div class="eyebrow mb-4">Intercepts</div>
              <div id="ebpf-stat-intercepted" class="text-5xl font-black text-white tabular-nums">0000</div>
           </div>
 
           <div class="p-4 bg-black/40 border border-white/5 rounded-lg">
              <div class="eyebrow mb-4">Anomalies</div>
              <div id="ebpf-stat-drifts" class="text-5xl font-black text-white tabular-nums">00</div>
           </div>
        </div>
        
        <div class="col-span-12 lg:col-span-9 space-y-4">
           <div class="bg-black/20 border border-white/5 rounded-lg overflow-hidden">
              <header class="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
                 <h3 class="tactical-title text-base tracking-widest">KERNEL_EVENT_STREAM</h3>
                 <div class="status-pill primary">LIVE_AUDIT</div>
              </header>
              <div id="ebpf-event-log" class="h-[400px] overflow-y-auto custom-scrollbar">
                 <div class="eyebrow p-5 text-center opacity-20">Listening_For_Syscalls...</div>
              </div>
           </div>
 
           <div class="t-panel glass-panel p-0 border-t-2 border-danger/30 overflow-hidden">
              <header class="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
                 <h3 class="tactical-title text-base tracking-widest">KERNEL_EVENT_LEDGER</h3>
                 <span class="eyebrow">Persistent Forensic Trail</span>
              </header>
              <div class="overflow-x-auto">
                 <table class="w-full text-left">
                    <thead class="bg-black/20 border-b border-white/5">
                       <tr>
                          <th class="eyebrow p-4">Timestamp</th>
                          <th class="eyebrow p-4">Type</th>
                          <th class="eyebrow p-4">Source</th>
                          <th class="eyebrow p-4">Message</th>
                          <th class="eyebrow p-4 text-right">Action</th>
                       </tr>
                    </thead>
                    <tbody id="ebpf-ledger-body" class="divide-y divide-white/5">
                       <tr>
                          <td colspan="5" class="eyebrow p-5 text-center opacity-20">Awaiting_Forensic_Data...</td>
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
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new SharedWebSocket();

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
        globalThis.location.href = "/login";
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
        <div class="p-5 space-y-4">
           <div class="h-16 w-full bg-white/5 animate-pulse rounded-lg"></div>
           <div class="h-16 w-full bg-white/5 animate-pulse rounded-lg opacity-60"></div>
           <div class="h-16 w-full bg-white/5 animate-pulse rounded-lg opacity-30"></div>
        </div>
      `;
      return;
    }
 
    // SEC-03: DOM-based XSS Hardening.
    // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.

    // Live Stream: Detailed per-event telemetry
    container.innerHTML = '';
    this.logs.forEach(log => {
      const isCritical = log.type === 'DRIFT_PROCESS' || log.type === 'EBPF_CRITICAL' || log.message?.toLowerCase().includes('unauthorized');
      const pid = log.data?.pid || log.data?.target_pid || '';
      const typeLabel = (log.type || '').replace('EBPF_', '');

      const logEl = document.createElement('div');
      logEl.className = "p-6 border-b border-white/[0.03] hover:bg-white/[0.02] group relative transition-colors";
      logEl.style.borderLeft = `4px solid ${isCritical ? 'var(--danger)' : 'transparent'}`;

      const topRow = document.createElement('div');
      topRow.className = "flex justify-between items-center mb-2";

      const leftPart = document.createElement('div');
      leftPart.className = "flex items-center gap-3";

      const statusPill = document.createElement('span');
      statusPill.className = `status-pill ${isCritical ? 'danger' : 'neutral'} text-[8px]`;
      statusPill.textContent = typeLabel;

      const interceptSpan = document.createElement('span');
      interceptSpan.className = "mono-xs text-slate-600 font-bold uppercase tracking-widest text-[9px]";
      interceptSpan.textContent = "Syscall_Intercept";

      leftPart.appendChild(statusPill);
      leftPart.appendChild(interceptSpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = "mono-xs text-slate-600 font-bold";
      timeSpan.textContent = new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});

      topRow.appendChild(leftPart);
      topRow.appendChild(timeSpan);

      const msgDiv = document.createElement('div');
      msgDiv.className = `mono-sm font-bold ${isCritical ? 'text-danger' : 'text-slate-400'} uppercase tracking-tight leading-tight mb-3`;
      msgDiv.textContent = log.message;

      if (log.data?.anomalyScore > 0.5) {
          const anomalySpan = document.createElement('span');
          anomalySpan.className = "text-[8px] px-2 py-0.5 bg-danger/20 text-danger rounded border border-danger/30 font-black ml-4";
          anomalySpan.textContent = `NEURAL_ANOMALY_${(log.data.anomalyScore*100).toFixed(0)}%`;
          msgDiv.appendChild(anomalySpan);
      }

      logEl.appendChild(topRow);
      logEl.appendChild(msgDiv);

      if (isCritical && pid) {
          const btnRow = document.createElement('div');
          btnRow.className = "flex gap-4";
          const purgeBtn = document.createElement('button');
          purgeBtn.dataset.purgePid = pid;
          purgeBtn.className = "t-btn danger !py-1 !px-3 text-[8px] font-black uppercase tracking-widest rounded transition-colors";
          purgeBtn.textContent = `PURGE_PID_${pid}`;
          btnRow.appendChild(purgeBtn);
          logEl.appendChild(btnRow);
      }

      container.appendChild(logEl);
    });
 
    // Ledger Table: Forensic summary of only CRITICAL/DRIFT events to avoid duplication
    const forensicLogs = this.logs.filter(log => log.type === 'DRIFT_PROCESS' || log.type === 'EBPF_CRITICAL' || log.message?.toLowerCase().includes('unauthorized'));
    
    if (forensicLogs.length === 0) {
      ledger.innerHTML = `<tr><td colspan="5" class="eyebrow p-5 text-center opacity-20">Listening_For_Critical_Violations...</td></tr>`;
    } else {
      ledger.innerHTML = '';
      forensicLogs.forEach(log => {
         const pid = log.data?.pid || log.data?.target_pid || 'N/A';
         const typeLabel = (log.type || '').replace('EBPF_', '');
         const isCritical = log.type === 'DRIFT_PROCESS' || log.type === 'EBPF_CRITICAL';
   
         const tr = document.createElement('tr');
         tr.className = "hover:bg-white/[0.02] transition-colors";

         const timeTd = document.createElement('td');
         timeTd.className = "p-4 mono-xs text-slate-500 font-bold";
         timeTd.textContent = new Date(log.timestamp).toLocaleTimeString();

         const typeTd = document.createElement('td');
         typeTd.className = "p-4";
         const typePill = document.createElement('span');
         typePill.className = `status-pill ${isCritical ? 'danger' : 'neutral'} !px-3 !py-0.5 text-[8px]`;
         typePill.textContent = typeLabel;
         typeTd.appendChild(typePill);

         const sourceTd = document.createElement('td');
         sourceTd.className = "p-4 mono-xs text-slate-400 font-black";
         sourceTd.textContent = `PID: ${pid}`;

         const msgTd = document.createElement('td');
         msgTd.className = "p-4 mono-xs text-slate-300 font-bold uppercase tracking-tight truncate max-w-[200px]";
         msgTd.textContent = log.message;

         const actionTd = document.createElement('td');
         actionTd.className = "p-4 text-right";
         if (pid !== 'N/A') {
             const purgeBtn = document.createElement('button');
             purgeBtn.dataset.purgePid = pid;
             purgeBtn.className = "mono-xs text-danger hover:text-white transition-colors uppercase font-black";
             purgeBtn.textContent = "PURGE";
             actionTd.appendChild(purgeBtn);
         } else {
             actionTd.textContent = "---";
         }

         tr.appendChild(timeTd);
         tr.appendChild(typeTd);
         tr.appendChild(sourceTd);
         tr.appendChild(msgTd);
         tr.appendChild(actionTd);
         ledger.appendChild(tr);
      });
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
