/**
 * Custom Element: FimAgent
 * File Integrity Monitoring guardian tracking unauthorized filesystem modifications.
 */
class FimAgent extends HTMLElement {
  constructor() {
    super();
    this.alerts = [];
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
         <header class="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
            <h3 class="tactical-title text-base tracking-widest">FILE_INTEGRITY_AUDIT</h3>
            <div class="status-pill warning">WATCH_ACTIVE</div>
         </header>
         <div id="fim-alerts" class="h-[600px] overflow-y-auto custom-scrollbar">
            <div class="p-12 text-center opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Monitoring_Filesystem_Integrity...</div>
         </div>
      </div>
    `;
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'FIM_ALERT' || (payload.data?.type === 'FileAlert')) {
          this.addAlert(payload.data || payload);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connectWS(), 5000);
  }

  addAlert(alert) {
    this.alerts.unshift(alert);
    if (this.alerts.length > 100) this.alerts.pop();
    this.render();
  }

  render() {
    const container = document.getElementById('fim-alerts');
    if (!container) return;

    if (this.alerts.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-24 opacity-20">
           <div class="w-12 h-12 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mb-6"></div>
           <div class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em] ">Awaiting_Integrity_Signals...</div>
        </div>
      `;
      return;
    }

    container.innerHTML = this.alerts.map(alert => {
      const isCritical = ['MODIFY', 'DELETE', 'UNLINK'].includes(alert.action?.toUpperCase());
      const color = isCritical ? 'var(--danger)' : 'var(--warning)';

      return `
        <div class="p-6 border-b border-white/[0.03] hover:bg-white/[0.02] group transition-colors" 
             style="border-left: 4px solid ${color}">
          <div class="flex justify-between items-center mb-3">
             <div class="flex items-center gap-4">
                <span class="mono-xs font-black uppercase tracking-widest ${isCritical ? 'text-danger' : 'text-warning'}">
                  ${window.escapeHTML(alert.action || 'MODIFY')}
                </span>
                <span class="dot ${isCritical ? 'danger' : 'warning'}" style="width: 4px; height: 4px;"></span>
                <span class="mono-xs text-slate-700 font-bold uppercase tracking-widest">Integrity_Violation</span>
             </div>
             <span class="mono-xs text-slate-600 font-bold">${new Date().toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          </div>
          <div class="flex items-start gap-4">
             <div class="mono-sm font-bold text-slate-400 uppercase tracking-tight break-all leading-relaxed">
               ${window.escapeHTML(alert.path)}
             </div>
          </div>
          <div class="mt-4 flex gap-4">
             <div class="status-pill ${isCritical ? 'danger' : 'warning'} py-1 px-3 text-[8px] font-black uppercase tracking-widest">UNAUTHORIZED_ACCESS</div>
             <div class="status-pill py-1 px-3 text-[8px] font-black uppercase tracking-widest border border-white/5 text-slate-500">SHA-256_MISMATCH</div>
          </div>
        </div>
      `;
    }).join('');
  }
}

customElements.define('fim-agent', FimAgent);
