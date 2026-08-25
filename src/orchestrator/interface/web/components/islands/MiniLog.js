class MiniLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
  }

  connectedCallback() {
    // Ensure escape helper is available
    if (!globalThis.escapeHTML) {
      globalThis.escapeHTML = (str) => {
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
        this.logs = await res.json();
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
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${globalThis.location.host}/api/ws/events`);

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) {
        url.searchParams.set('token', csrfToken);
    }

    this._ws = new SharedWebSocket();
    const ws = this._ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const tacticalTypes = ['BLOCK', 'ALERT', 'AUDIT_EVENT', 'TACTICAL_TRIGGER', 'audit', 'activity', 'generic', 'debug', 'CRITICAL', 'WARNING', 'INFO'];
        if (tacticalTypes.includes(payload.type)) {
          const logData = payload.data || payload;
          this.logs.unshift(logData);
          if (this.logs.length > 100) this.logs.pop();
          this.render();
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      this._reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
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
           <div class="eyebrow p-4 text-center border border-dashed border-white/10 italic">
              Synchronizing telemetry stream...
           </div>
        </div>
      `;
      return;
    }

    // SEC-03: DOM-based XSS Hardening.
    // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
    this.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = "space-y-1 max-h-[calc(100vh_-_250px)] overflow-y-auto custom-scrollbar pr-2";

    this.logs.forEach(log => {
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

      const logEl = document.createElement('div');
      logEl.className = "flex flex-col border-b border-white/[0.02] hover:bg-white/[0.05] transition-colors group cursor-pointer overflow-hidden";

      const row = document.createElement('div');
      row.className = "flex items-center gap-2 py-1 px-2 relative h-6";

      const indicator = document.createElement('div');
      indicator.className = `absolute inset-y-0 left-0 w-0.5 ${this.getSeverityBgClass(severity)} opacity-40 group-hover:opacity-100`;
      row.appendChild(indicator);

      const typeSpan = document.createElement('span');
      typeSpan.className = `flex-shrink-0 mono text-[6.5px] font-black uppercase tracking-tighter ${typeColorClass} w-8`;
      typeSpan.textContent = type.slice(0, 4);
      row.appendChild(typeSpan);

      const sevSpan = document.createElement('span');
      sevSpan.className = `flex-shrink-0 mono text-[6.5px] font-bold uppercase tracking-tighter ${severityTextClass} w-6`;
      sevSpan.textContent = severity.slice(0, 3);
      row.appendChild(sevSpan);

      const callerSpan = document.createElement('span');
      callerSpan.className = "flex-shrink-0 mono text-[6.5px] text-slate-500 font-bold uppercase truncate tracking-tighter w-16 opacity-60";
      callerSpan.textContent = caller.slice(0, 10);
      row.appendChild(callerSpan);

      const msgSpan = document.createElement('span');
      msgSpan.className = "flex-grow min-w-0 text-[7.5px] text-slate-300 font-medium truncate tracking-tight";
      msgSpan.textContent = log.message || '---';
      row.appendChild(msgSpan);

      const timeSpan = document.createElement('span');
      timeSpan.className = "flex-shrink-0 mono text-[6.5px] font-black text-slate-600 tabular-nums";
      timeSpan.textContent = timeStr;
      row.appendChild(timeSpan);

      const detail = document.createElement('div');
      detail.className = "message-detail hidden px-4 py-3 bg-black/60 border-t border-white/5";

      const detailInner = document.createElement('div');
      detailInner.className = "mono text-[8px] text-primary/90 leading-relaxed bg-black/40 p-3 rounded-lg border border-white/5";

      const detailHeader = document.createElement('div');
      detailHeader.className = "text-slate-500 mb-2 uppercase tracking-widest border-b border-white/5 pb-1";
      detailHeader.textContent = "Full_Forensic_Message";
      detailInner.appendChild(detailHeader);

      const detailMsg = document.createElement('div');
      detailMsg.textContent = log.message || '---';
      detailInner.appendChild(detailMsg);

      if (log.payload) {
          const payloadDiv = document.createElement('div');
          payloadDiv.className = "mt-2 pt-2 border-t border-white/5 text-[7px] text-slate-500 uppercase";
          payloadDiv.textContent = `Payload: ${JSON.stringify(log.payload)}`;
          detailInner.appendChild(payloadDiv);
      }

      detail.appendChild(detailInner);
      logEl.appendChild(row);
      logEl.appendChild(detail);

      logEl.onclick = () => {
          detail.classList.toggle('hidden');
      };

      wrapper.appendChild(logEl);
    });

    this.appendChild(wrapper);

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
