/**
 * ThreatIntelList Island
 * Authoritative OSINT ingestion and enforcement manifest.
 */
import { unwrap } from "./api.js";
class ThreatIntelList extends HTMLElement {
  constructor() {
    super();
    this.threats = [];
  }

  connectedCallback() {
    this.renderBase();
    this.fetchInitial();
    this.connect();
  }

  async fetchInitial() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/threats/identified?limit=15', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await unwrap(res);
        const list = Array.isArray(data) ? data : (data.threats || []);
        if (list.length > 0) {
          this.updateThreats(list);
        }
      }
    } catch (e) {
      console.warn('[THREAT-INTEL-LIST] Initial fetch failed');
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new SharedWebSocket();

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
      <div id="threat-container" class="flex flex-col gap-3">
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
        <div class="p-4 bg-black/40 border border-white/5 rounded-lg flex items-center justify-between">
           <div class="flex items-center gap-3">
              <div class="indicator" data-state="ok" aria-hidden="true"></div>
              <span class="eyebrow">No Active Threat Neutralizations In Flight</span>
           </div>
           <span class="status-pill success active">Perimeter Clear</span>
        </div>
      `;
      return;
    }

    container.innerHTML = threats.map(t => {
      const theme = t.blocked ? 'success' : 'danger';
      const color = `var(--${theme})`;

      return `
        <div class="flex items-center justify-between p-4 bg-black/40 border border-white/5 rounded-lg group hover:border-white/10">
           <div class="flex items-center gap-4">
              <div class="dot ${theme} ${t.blocked ? 'shadow-success' : 'shadow-danger'}"></div>
              <div class="flex flex-col gap-2">
                 <span class="mono-sm font-bold tracking-tight ${t.blocked ? 'text-success' : 'text-white'} uppercase select-all">${window.escapeHTML(t.indicator)}</span>
                 <div class="flex items-center gap-4">
                    <span class="eyebrow">${window.escapeHTML(t.threatType)}</span>
                    <span class="text-slate-800 text-[10px]">//</span>
                    <span class="eyebrow text-primary/40">${window.escapeHTML(t.provider)}</span>
                 </div>
              </div>
           </div>
           <div class="flex items-center">
              <div class="status-pill ${theme} ${t.blocked ? 'pulse' : ''}">
                 ${t.blocked ? 'ENFORCEMENT_ACTIVE' : 'AWAITING_NEUTRALIZATION'}
              </div>
           </div>
        </div>
      `;
    }).join('');
  }
}

customElements.define('threat-intel-list', ThreatIntelList);
