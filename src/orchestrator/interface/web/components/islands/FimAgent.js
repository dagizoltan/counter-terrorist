/**
 * Custom Element: FimAgent
 * File Integrity Monitoring guardian tracking unauthorized filesystem modifications.
 */
import { unwrap } from "./api.js";
class FimAgent extends HTMLElement {
  constructor() {
    super();
    this.alerts = [];
  }

  connectedCallback() {
    this.innerHTML = `
      <div class="bg-black/20 border border-white/5 rounded-lg overflow-hidden">
         <header class="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
            <h3 class="tactical-title text-base tracking-widest">FILE_INTEGRITY_AUDIT</h3>
            <div class="status-pill warning">WATCH_ACTIVE</div>
         </header>
         <div id="fim-alerts" class="h-[600px] overflow-y-auto custom-scrollbar">
            <div class="eyebrow p-5 text-center opacity-20">Monitoring_Filesystem_Integrity...</div>
         </div>
      </div>
    `;
    this.fetchInitial();
    this.connectWS();
  }

  async fetchInitial() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/compliance/logs?limit=50', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await unwrap(res);
        const logs = Array.isArray(data) ? data : (data.items || []);
        const fimLogs = logs.filter(l => l.caller?.includes('fim') || l.type === 'FIM_ALERT' || l.type === 'DRIFT_PROCESS');
        if (fimLogs.length > 0) {
          this.alerts = fimLogs;
          this.render();
        }
      }
    } catch (e) {
      console.warn('[FIM-AGENT] Initial fetch failed');
    }
  }

  connectWS() {
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new SharedWebSocket();

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const type = payload.type || '';
        // Support both domain events and raw sidecar alerts
        if (type === 'DRIFT_PROCESS' || type === 'THREAT' || type === 'FIM_ALERT' || (payload.caller === 'fim:observer' && payload.type === 'ACTIVITY')) {
          this.addAlert(payload.data || payload.payload || payload);
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
        <div class="flex flex-col items-center justify-center p-6 opacity-20">
           <div class="w-12 h-12 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mb-4"></div>
           <div class="eyebrow">Awaiting_Integrity_Signals...</div>
        </div>
      `;
      return;
    }

    // SEC-03: DOM-based XSS Hardening.
    // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
    container.innerHTML = '';
    this.alerts.forEach(alert => {
      const isCritical = ['MODIFY', 'DELETE', 'UNLINK'].includes(alert.action?.toUpperCase());
      const color = isCritical ? 'var(--danger)' : 'var(--warning)';

      const alertEl = document.createElement('div');
      alertEl.className = "p-6 border-b border-white/[0.03] hover:bg-white/[0.02] group transition-colors";
      alertEl.style.borderLeft = `4px solid ${color}`;

      const topRow = document.createElement('div');
      topRow.className = "flex justify-between items-center mb-3";

      const leftPart = document.createElement('div');
      leftPart.className = "flex items-center gap-4";

      const actionSpan = document.createElement('span');
      actionSpan.className = `mono-xs font-black uppercase tracking-widest ${isCritical ? 'text-danger' : 'text-warning'}`;
      actionSpan.textContent = alert.action || 'MODIFY';

      const dot = document.createElement('span');
      dot.className = `dot ${isCritical ? 'danger' : 'warning'}`;
      dot.style.width = '4px';
      dot.style.height = '4px';

      const violationSpan = document.createElement('span');
      violationSpan.className = "mono-xs text-slate-700 font-bold uppercase tracking-widest";
      violationSpan.textContent = "Integrity_Violation";

      leftPart.appendChild(actionSpan);
      leftPart.appendChild(dot);
      leftPart.appendChild(violationSpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = "mono-xs text-slate-600 font-bold";
      timeSpan.textContent = new Date().toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});

      topRow.appendChild(leftPart);
      topRow.appendChild(timeSpan);

      const pathRow = document.createElement('div');
      pathRow.className = "flex items-start gap-4";
      const pathDiv = document.createElement('div');
      pathDiv.className = "mono-sm font-bold text-slate-400 uppercase tracking-tight break-all leading-relaxed";
      pathDiv.textContent = alert.path;
      pathRow.appendChild(pathDiv);

      const footer = document.createElement('div');
      footer.className = "mt-4 flex gap-4";
      footer.innerHTML = `
         <div class="status-pill ${isCritical ? 'danger' : 'warning'} font-black uppercase tracking-widest">UNAUTHORIZED_ACCESS</div>
         <div class="status-pill font-black uppercase tracking-widest border border-white/5">SHA-256_MISMATCH</div>
      `;

      alertEl.appendChild(topRow);
      alertEl.appendChild(pathRow);
      alertEl.appendChild(footer);
      container.appendChild(alertEl);
    });
  }
}

customElements.define('fim-agent', FimAgent);
