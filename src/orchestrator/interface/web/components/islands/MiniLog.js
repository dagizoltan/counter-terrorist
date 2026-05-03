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
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);
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
      <div class="flex flex-col">
        ${this.logs.length === 0 ? `
          <div class="flex flex-col items-center justify-center p-16 opacity-10">
             <div class="w-12 h-12 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mb-6"></div>
             <div class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em] text-center">Synchronizing_Forensic_Buffer...</div>
          </div>
        ` : this.logs.map((log, idx) => {
          const color = this.getColor(log.type);
          const isCritical = ['BLOCK', 'THREAT', 'CRITICAL', 'EMERGENCY', 'DRIFT_PROCESS'].includes(log.type);
          return `
            <div class="border-l-4 pl-5 py-4 group transition-all animate-fade-in border-white/5 hover:bg-white/[0.03] relative overflow-hidden" 
                 style="border-left-color: ${isCritical ? 'var(--danger)' : color}; animation-delay: ${idx * 20}ms">
              ${isCritical ? `<div class="absolute inset-0 bg-danger/5 animate-pulse pointer-events-none"></div>` : ''}
              <div class="flex justify-between items-center mb-2 relative z-10">
                <span class="mono-xs font-black uppercase tracking-widest px-2 py-0.5 rounded" 
                      style="background: ${isCritical ? 'var(--danger)' : 'transparent'}; color: ${isCritical ? 'white' : color}">
                  ${log.type}
                </span>
                <span class="mono-xs text-slate-600 uppercase font-bold text-[8px] tracking-widest">
                  ${new Date(log.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}
                </span>
              </div>
              <div class="mono-xs font-bold text-slate-400 group-hover:text-white transition-colors leading-relaxed uppercase tracking-tight text-[10px] relative z-10">
                ${escape(log.message)}
              </div>
              ${log.data?.source ? `
                <div class="mt-2 flex items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity">
                  <span class="mono-xs text-[8px] text-slate-500 font-black">SRC:</span>
                  <span class="mono-xs text-[8px] text-primary font-black">${log.data.source}</span>
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
