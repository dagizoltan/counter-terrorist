/**
 * Custom Element: MiniLog
 * Lightweight real-time event stream for the forensic sidebar.
 * Synchronized with the Industrial Tactical Design System.
 */
class MiniLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
  }

  async connectedCallback() {
    await this.fetchHistory();
    this.connect();
    this.render();
  }

  async fetchHistory() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/system/logs?limit=50', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await res.json();
        this.logs = data; 
        this.render();
      }
    } catch (e) {
      console.error("[MINILOG] Failed to fetch history:", e);
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.logs.unshift(data);
        if (this.logs.length > 100) this.logs.pop();
        this.render();
      } catch (e) {}
    };
    socket.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  render() {
    const escape = window.escapeHTML || ((s) => s);
    this.innerHTML = `
      <div class="flex flex-col gap-4">
        ${this.logs.length === 0 ? `
          <div class="flex flex-col gap-4">
             <div class="skeleton h-16 w-full"></div>
             <div class="skeleton h-16 w-full opacity-60"></div>
             <div class="skeleton h-16 w-full opacity-30"></div>
          </div>
        ` : this.logs.map((log, idx) => {
          const color = this.getColor(log.type);
          const isCritical = ['BLOCK', 'THREAT', 'CRITICAL', 'EMERGENCY', 'DRIFT_PROCESS'].includes(log.type);
          return `
            <div class="p-6 border-l-4 border-slate-800 hover:border-primary bg-black/20 hover:bg-black/40 transition-all animate-fade-in relative overflow-hidden" 
                 style="border-left-color: ${isCritical ? 'var(--danger)' : 'var(--border-subtle)'};">
              ${isCritical ? `<div class="absolute inset-0 bg-danger/5 animate-pulse pointer-events-none"></div>` : ''}
              <div class="flex justify-between items-center mb-4 relative z-10">
                <span class="status-pill ${isCritical ? 'danger' : 'primary'} border-none p-0 bg-transparent">
                  ${log.type}
                </span>
                <span class="mono-xs text-slate-600 font-bold tracking-widest">
                  ${new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                </span>
              </div>
              <div class="mono-xs font-bold text-slate-400 group-hover:text-white transition-colors leading-relaxed uppercase tracking-tight relative z-10">
                ${escape(log.message)}
              </div>
              ${log.data?.source ? `
                <div class="mt-4 flex items-center gap-3 opacity-40 group-hover:opacity-100 transition-opacity">
                  <span class="mono-xs text-slate-500 font-bold">SOURCE:</span>
                  <span class="mono-xs text-primary font-bold">${log.data.source}</span>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  getColor(type) {
    if (['BLOCK', 'THREAT', 'CRITICAL', 'EMERGENCY', 'DRIFT_PROCESS'].includes(type)) return 'var(--danger)';
    if (['WARN', 'WARNING'].includes(type)) return 'var(--warning)';
    if (['SUCCESS', 'VERIFIED'].includes(type)) return 'var(--success)';
    return 'var(--primary)';
  }
}

customElements.define('mini-log', MiniLog);
