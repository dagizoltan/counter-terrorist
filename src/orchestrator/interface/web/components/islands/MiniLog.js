class MiniLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
  }

  connectedCallback() {
    console.log("[MINI-LOG] Connected to DOM");
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
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

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
    if (!severity) return 'text-slate-500';
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
        <div class="space-y-3 opacity-40">
          <div class="skeleton h-8 w-full"></div>
          <div class="skeleton h-8 w-full opacity-60"></div>
          <div class="skeleton h-8 w-full opacity-30"></div>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
        ${this.logs.map(log => `
          <div class="flex flex-col gap-1 p-3 bg-white/[0.02] border border-white/5 rounded hover:bg-white/[0.04]">
            <div class="flex justify-between items-center">
              <span class="mono-xs font-black uppercase tracking-widest ${this.getSeverityClass(log.severity || log.type)}">
                ${log.type || 'LOG_EVENT'}
              </span>
              <span class="text-[8px] text-slate-600 mono">
                ${new Date(log.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div class="mono-xs text-slate-400 leading-tight">
              ${log.message || log.description || 'System interaction logged.'}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

customElements.define('mini-log', MiniLog);
