/**
 * ThreatIntelList Island
 * Authoritative OSINT ingestion and enforcement manifest.
 */
class ThreatIntelList extends HTMLElement {
  constructor() {
    super();
    this.threats = [];
  }

  connectedCallback() {
    this.renderBase();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'METRICS_UPDATE' && payload.data?.tactical) {
          this.updateThreats(payload.data.tactical.recentThreats);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  renderBase() {
    this.innerHTML = `
      <div id="threat-container" class="space-y-4">
         <div class="p-16 text-center border border-dashed border-white/5 opacity-30 rounded">
            <span class="mono-xs font-black text-primary animate-pulse uppercase tracking-[0.4em]">Synchronizing_Intelligence_Buffer...</span>
         </div>
      </div>
    `;
  }

  updateThreats(threats) {
    const container = this.querySelector('#threat-container');
    if (!container) return;

    if (!threats || threats.length === 0) {
      container.innerHTML = `
        <div class="p-16 text-center border border-dashed border-white/10 opacity-50 rounded">
           <span class="mono-xs font-black text-slate-500 uppercase tracking-widest italic">Intelligence_Stream_Quiet</span>
        </div>
      `;
      return;
    }

    container.innerHTML = threats.map(t => {
      const theme = t.blocked ? 'success' : 'danger';
      const color = `var(--${theme})`;
      
      return `
        <div class="flex items-center justify-between p-5 bg-black/40 border border-white/5 rounded-lg group hover:border-white/20 transition-all animate-fade-in">
           <div class="flex items-center gap-6">
              <div class="dot ${theme} ${t.blocked ? '' : 'pulse shadow-danger'}"></div>
              <div class="flex flex-col gap-1">
                 <span class="mono-sm font-black tracking-tight ${t.blocked ? 'text-success' : 'text-white'} uppercase select-all">${window.escapeHTML(t.indicator)}</span>
                 <div class="flex items-center gap-3">
                    <span class="mono-xs font-bold text-slate-500 uppercase tracking-widest">${window.escapeHTML(t.threatType)}</span>
                    <span class="text-slate-800 text-[10px]">//</span>
                    <span class="mono-xs font-black text-primary/60 uppercase tracking-tighter">${window.escapeHTML(t.provider)}</span>
                 </div>
              </div>
           </div>
           <div class="flex items-center gap-8">
              <div class="mono-xs font-black px-4 py-2 border rounded transition-all" 
                   style="background: var(--${theme}-glow); border-color: ${color}; color: ${color};">
                 ${t.blocked ? 'ENFORCEMENT_ACTIVE' : 'AWAITING_NEUTRALIZATION'}
              </div>
           </div>
        </div>
      `;
    }).join('');
  }
}

customElements.define('threat-intel-list', ThreatIntelList);
