class MiniLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
  }

  connectedCallback() {
    // Ensure escape helper is available
    if (!window.escapeHTML) {
      window.escapeHTML = (str) => {
        if (typeof str !== 'string') return String(str);
        return str.replace(/[&<>"']/g, (m) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
      };
    }
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
        const allLogs = await res.json();
        this.logs = allLogs.filter(log => {
            const isAudit = log.type === 'audit' || log.type === 'AUDIT';
            const isInfo = (log.severity || '').toLowerCase() === 'info';
            return !(isAudit && isInfo);
        });
        this.render();
      }
    } catch (e) {
      console.warn('[MINI-LOG] Initial fetch failed');
    }
  }

  connect() {
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) {
        url.searchParams.set('token', csrfToken);
    }

    this._ws = new SharedWebSocket(url.toString());
    const ws = this._ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const tacticalTypes = ['BLOCK', 'ALERT', 'AUDIT_EVENT', 'TACTICAL_TRIGGER', 'audit', 'activity', 'generic', 'debug', 'CRITICAL', 'WARNING', 'INFO'];
        if (tacticalTypes.includes(payload.type)) {
          const logData = payload.data || payload;
          
          // Filter: Exclude routine administrative AUDIT logs from the real-time telemetry stream
          // to reduce noise, but ALLOW warning/error audit logs through to maintain forensic visibility.
          const isAudit = logData.type === 'audit' || logData.type === 'AUDIT';
          const isInfo = (logData.severity || '').toLowerCase() === 'info';
          if (isAudit && isInfo) return;
          
          this.logs.unshift(logData);
          if (this.logs.length > 100) this.logs.pop();
          this.render();
        }
      } catch (e) {}
    };

    /* Reconnection handled by SharedWebSocket */
  }

  disconnectedCallback() {
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
    }
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
      <div class="space-y-1 max-h-[calc(100vh-250px)] overflow-y-auto custom-scrollbar pr-2">
        ${this.logs.map(log => {
          let rawType = (log.type || 'generic').toLowerCase();
          
          // Map legacy types to mandated taxonomy
          if (rawType === 'block' || rawType === 'alert' || rawType === 'critical') rawType = 'audit';
          if (rawType === 'warning' || rawType === 'info' || rawType === 'success') rawType = 'activity';
          if (!['audit', 'activity', 'generic', 'debug'].includes(rawType)) rawType = 'generic';

          const type = rawType.toUpperCase().slice(0, 8);
          const severity = (log.severity || 'info').toLowerCase();
          const caller = (log.caller || 'SYSTEM').toUpperCase().slice(0, 18);
          const date = new Date(log.timestamp || Date.now());
          const timeStr = date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          
          const severityTextClass = this.getSeverityClass(severity);
          const typeColorClass = this.getTypeColorClass(type);
          
          return `
            <div class="flex flex-col border-b border-white/[0.02] hover:bg-white/[0.05] transition-colors group cursor-pointer overflow-hidden">
              <!-- Ultra-Compact Single Row -->
              <div class="flex items-center gap-2 py-1 px-2 relative h-6">
                <div class="absolute inset-y-0 left-0 w-0.5 ${this.getSeverityBgClass(severity)} opacity-40 group-hover:opacity-100"></div>
                
                <span class="flex-shrink-0 mono text-[6.5px] font-black uppercase tracking-tighter ${typeColorClass} w-8">
                  ${window.escapeHTML(type.slice(0, 4))}
                </span>

                <span class="flex-shrink-0 mono text-[6.5px] font-bold uppercase tracking-tighter ${severityTextClass} w-6">
                  ${window.escapeHTML(severity.slice(0, 3))}
                </span>

                <span class="flex-shrink-0 mono text-[6.5px] text-slate-500 font-bold uppercase truncate tracking-tighter w-16 opacity-60">
                  ${window.escapeHTML(caller.slice(0, 10))}
                </span>

                <span class="flex-grow min-w-0 text-[7.5px] text-slate-300 font-medium truncate tracking-tight">
                  ${window.escapeHTML(log.message || '---')}
                </span>
 
                <span class="flex-shrink-0 mono text-[6.5px] font-black text-slate-600 tabular-nums">
                  ${timeStr}
                </span>
              </div>
  
              <!-- Expanded Payload (Hidden) -->
              <div class="message-detail hidden px-4 py-3 bg-black/60 border-t border-white/5">
                <div class="mono text-[8px] text-primary/90 leading-relaxed bg-black/40 p-3 rounded-lg border border-white/5">
                  <div class="text-slate-500 mb-2 uppercase tracking-widest border-b border-white/5 pb-1">Full_Forensic_Message</div>
                  ${window.escapeHTML(log.message || '---')}
                  ${log.payload ? `<div class="mt-2 pt-2 border-t border-white/5 text-[7px] text-slate-500 uppercase">Payload: ${JSON.stringify(log.payload)}</div>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Attach click listeners for accordion
    this.querySelectorAll('.group').forEach(el => {
      el.onclick = () => {
        const detail = el.querySelector('.message-detail');
        if (!detail) return;
        const isHidden = detail.classList.contains('hidden');
        
        // Toggle expansion
        detail.classList.toggle('hidden');
        
        // Optional: rotate arrow if it exists (not in current ultra-compact design)
        const arrow = el.querySelector('.arrow-icon');
        if (arrow) {
            arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
        }
      };
    });
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
