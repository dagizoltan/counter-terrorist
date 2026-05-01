class EbpfAgent extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
  }

  connectedCallback() {
    this.fetchStatus();
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Look for eBPF specific events like SYSCALL_DENIED or PROCESS_FORK
        if (payload.type?.startsWith('EBPF_') || payload.type === 'DRIFT_PROCESS') {
          this.addEvent(payload);
        }
      } catch (e) {
        console.error('[EBPF-AGENT] WS parse error', e);
      }
    };

    ws.onclose = () => {
      setTimeout(() => this.connectWS(), 5000);
    };
  }

  async fetchStatus() {
    try {
      const res = await fetch('/api/agent/status');
      const data = await res.json();
      const ebpf = data.ebpf;

      const statusLabel = document.getElementById('ebpf-status-label');
      const statusDot = document.getElementById('ebpf-status-dot');
      
      if (ebpf?.active) {
        if (statusLabel) statusLabel.textContent = 'Kernel Guardian Active';
        if (statusDot) statusDot.className = 'w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]';
      } else {
        if (statusLabel) statusLabel.textContent = 'Guardian Offline';
        if (statusDot) statusDot.className = 'w-2 h-2 bg-danger rounded-full';
      }
    } catch (e) {
      console.error('Failed to fetch eBPF status:', e);
    }
  }

  addEvent(event) {
    this.logs.unshift(event);
    if (this.logs.length > 50) this.logs.pop();
    this.renderLogs();
  }

  renderLogs() {
    const container = document.getElementById('ebpf-event-log');
    if (!container) return;

    if (this.logs.length === 0) {
      container.innerHTML = '<p class="text-slate-600 italic text-[10px] uppercase">Awaiting kernel signals...</p>';
      return;
    }

    container.innerHTML = this.logs.map(log => `
      <div class="flex items-center gap-3 p-2 border-b border-white/5 hover:bg-white/5 transition-all">
        <span class="text-[9px] font-mono text-slate-500">${new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
        <span class="px-2 py-0.5 bg-cyber/10 text-cyber text-[8px] font-black uppercase rounded">${log.type.replace('EBPF_', '')}</span>
        <span class="flex-1 text-[10px] font-medium text-slate-300 truncate">${log.message}</span>
      </div>
    `).join('');
  }
}
customElements.define('ebpf-agent', EbpfAgent);
