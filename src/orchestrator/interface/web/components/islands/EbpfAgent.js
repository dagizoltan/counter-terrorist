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
    this.fetchStatus();
    this.connectWS();
    this.render();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

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
          statusDot.className = 'dot active shadow-success pulse';
          statusDot.style.background = 'var(--success)';
        }
      } else {
        if (statusLabel) statusLabel.textContent = 'Guardian_Offline';
        if (statusDot) {
          statusDot.className = 'dot shadow-slate-800';
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
        interceptedEl.classList.add('animate-pulse');
        setTimeout(() => interceptedEl.classList.remove('animate-pulse'), 500);
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
        <div class="p-8 border-b border-white/[0.03] hover:bg-white/[0.02] transition-all animate-fade-in group relative" 
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
               <div class="status-pill danger pulse">POLICY_VIOLATION</div>
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
