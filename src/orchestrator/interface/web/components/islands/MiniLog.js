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
      <div class="space-y-3 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar pr-2">
        ${this.logs.map(log => {
          const type = (log.type || 'LOG').toUpperCase();
          const severity = (log.severity || (log.type === 'CRITICAL' ? 'critical' : 'info')).toLowerCase();
          const caller = (log.caller || 'SYSTEM').toUpperCase();
          const timestamp = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          // Use pre-formatted string if available
          const formatted = log.formatted || `[${type}] [${severity}] [${caller}] ${log.message}`;
          const [brackets, ...messageParts] = formatted.split(']');
          const bracketSection = brackets + ']';
          const messageSection = messageParts.join(']').trim();

          return `
            <div class="flex flex-col gap-1 p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-all group relative overflow-hidden">
              <div class="absolute inset-y-0 left-0 w-0.5 ${this.getSeverityBgClass(severity)} opacity-20 group-hover:opacity-100 transition-opacity"></div>
              
              <div class="flex justify-between items-center mb-1">
                <span class="mono text-[9px] font-black uppercase tracking-[0.1em] ${this.getSeverityClass(severity)}">
                  ${window.escapeHTML(bracketSection)}
                </span>
                <span class="text-[8px] text-slate-500 font-bold mono tabular-nums opacity-60">
                  ${timestamp}
                </span>
              </div>

              <div class="mono text-[10px] text-slate-300 leading-tight font-medium tracking-tight">
                ${window.escapeHTML(messageSection || 'System interaction recorded.')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  getSeverityBgClass(severity) {
    switch (severity) {
      case 'critical': case 'emergency': case 'error': return 'bg-danger';
      case 'warning': return 'bg-warning';
      case 'success': return 'bg-success';
      default: return 'bg-primary';
    }
  }

  getTypeColorClass(type) {
    if (type === 'BLOCK' || type === 'THREAT') return 'text-danger';
    if (type === 'AUDIT') return 'text-primary';
    return 'text-slate-400';
  }
}

if (!customElements.get('mini-log')) {
  customElements.define('mini-log', MiniLog);
}
