/**
 * ThreatIntelList Island
 * Authoritative OSINT ingestion and enforcement manifest.
 */
const escapeHTML = (str) => String(str).replace(/[&<>"']/g, m => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[m]);

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
    const ws = new SharedWebSocket(`${protocol}//${window.location.host}/api/ws/events${document.querySelector('meta[name="csrf-token"]')?.content ? `?token=${document.querySelector('meta[name="csrf-token"]')?.content}` : ''}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if ((payload.type === 'METRICS_UPDATE' || (payload.type === 'DEBUG' && payload.subType === 'METRICS_UPDATE')) && payload.data?.tactical) {
          this.updateThreats(payload.data.tactical.recentThreats);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  renderBase() {
    this.innerHTML = `
      <div id="threat-container" class="flex flex-col gap-5">
         <div class="skeleton h-24 w-full"></div>
         <div class="skeleton h-24 w-full opacity-60"></div>
         <div class="skeleton h-24 w-full opacity-30"></div>
      </div>
    `;
  }

  updateThreats(threats) {
    const container = this.querySelector('#threat-container');
    if (!container) return;

    if (!threats || threats.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
           <span class="mono-xs font-bold text-slate-500 uppercase tracking-widest italic">Intelligence_Stream_Quiet</span>
        </div>
      `;
      return;
    }

    container.innerHTML = threats.map(t => {
      const theme = t.blocked ? 'success' : 'danger';
      const color = `var(--${theme})`;
      
      return `
        <div class="flex items-center justify-between p-6 bg-black/40 border border-white/5 rounded-xl group hover:border-white/10 ">
           <div class="flex items-center gap-8">
              <div class="dot ${theme} ${t.blocked ? '' : 'pulse'}"></div>
              <div class="flex flex-col gap-2">
                 <span class="mono-sm font-bold tracking-tight ${t.blocked ? 'text-success' : 'text-white'} uppercase select-all">${escapeHTML(t.indicator)}</span>
                 <div class="flex items-center gap-4">
                    <span class="mono-xs font-bold text-slate-600 uppercase tracking-[0.2em]">${escapeHTML(t.threatType)}</span>
                    <span class="text-slate-800 text-[10px]">//</span>
                    <span class="mono-xs font-bold text-primary/40 uppercase tracking-[0.1em]">${escapeHTML(t.provider)}</span>
                 </div>
              </div>
           </div>
           <div class="flex items-center">
              <div class="status-pill ${theme} ${t.blocked ? 'active' : 'pulse'}">
                 ${t.blocked ? 'ENFORCEMENT_ACTIVE' : 'AWAITING_NEUTRALIZATION'}
              </div>
           </div>
        </div>
      `;
    }).join('');
  }
}

customElements.define('threat-intel-list', ThreatIntelList);
