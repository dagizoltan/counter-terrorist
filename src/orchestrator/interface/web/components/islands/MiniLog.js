class MiniLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
  }

  connectedCallback() {
    this.render();
    this.fetchInitial();
    this.connect();
  }

  async fetchInitial() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/system/logs?limit=50', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        this.logs = await res.json();
        this.render();
      }
    } catch (e) {
      console.warn('[MINI-LOG] Initial fetch failed');
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

    const socket = new WebSocket(url.toString());
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'BLOCK' || payload.type === 'ALERT' || payload.type === 'AUDIT_EVENT') {
          this.logs.unshift(payload.data || payload);
          if (this.logs.length > 100) this.logs.pop();
          this.render();
        }
      } catch (e) {}
    };
  }

  getSeverityClass(severity) {
    if (!severity) return 'text-slate-400';
    switch (severity.toUpperCase()) {
      case 'CRITICAL':
      case 'HIGH':
      case 'EMERGENCY':
      case 'ERROR':
        return 'text-danger';
      case 'WARNING':
      case 'MEDIUM':
        return 'text-warning';
      case 'SUCCESS':
      case 'LOW':
        return 'text-success';
      default:
        return 'text-primary';
    }
  }

  render() {
    if (this.logs.length === 0) {
      this.innerHTML = `
        <div class="space-y-4 opacity-30 p-4">
           <div class="p-6 text-center border border-dashed border-white/10 mono-xs uppercase tracking-widest italic">
              Synchronizing telemetry stream...
           </div>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-3">
        ${this.logs.map(log => {
          const type = (log.type || 'Log Event').replace(/_/g, ' ');
          return `
            <div class="flex flex-col gap-2 p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all">
              <div class="flex justify-between items-center">
                <span class="mono-xs font-black uppercase tracking-[0.2em] ${this.getSeverityClass(log.severity || log.type)}">
                  ${window.escapeHTML(type)}
                </span>
                <span class="text-[9px] text-slate-500 font-bold mono">
                  ${new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div class="mono-xs text-slate-300 leading-relaxed font-medium italic">
                ${window.escapeHTML(log.message || log.description || 'System interaction recorded.')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

if (!customElements.get('mini-log')) {
  customElements.define('mini-log', MiniLog);
}
