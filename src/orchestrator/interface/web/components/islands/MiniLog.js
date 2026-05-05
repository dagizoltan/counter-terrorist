class MiniLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
  }

  connectedCallback() {
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
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

    const socket = new WebSocket(url.toString());
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const tacticalTypes = ['BLOCK', 'ALERT', 'AUDIT_EVENT', 'audit', 'activity', 'generic', 'debug', 'CRITICAL', 'WARNING', 'INFO'];
        if (tacticalTypes.includes(payload.type)) {
          this.logs.unshift(payload.data || payload);
          if (this.logs.length > 100) this.logs.pop();
          this.render();
        }
      } catch (e) {}
    };
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
            <div class="flex flex-col border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group cursor-pointer overflow-hidden">
              <!-- Main Compact Row -->
              <div class="flex items-center gap-3 py-1.5 px-3 relative">
                <div class="absolute inset-y-0 left-0 w-0.5 ${this.getSeverityBgClass(severity)} opacity-20 group-hover:opacity-100 transition-opacity"></div>
                
                <!-- Metadata Left -->
                <span class="w-12 flex-shrink-0 mono text-[8px] font-black uppercase tracking-tighter ${typeColorClass} opacity-80">
                  ${window.escapeHTML(type)}
                </span>
 
                <span class="w-10 flex-shrink-0 mono text-[8px] font-black uppercase tracking-tighter ${severityTextClass}">
                  ${window.escapeHTML(severity.slice(0, 4))}
                </span>
 
                <span class="flex-grow min-w-0 mono text-[8px] text-slate-400 font-black uppercase truncate tracking-tighter">
                  ${window.escapeHTML(caller)}
                </span>
 
                <!-- Time Right -->
                <span class="flex-shrink-0 mono text-[8px] font-black text-slate-500 tabular-nums">
                  ${timeStr}
                </span>
 
                <div class="flex-shrink-0 opacity-20 group-hover:opacity-100 transition-opacity">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" class="transform transition-transform duration-300 arrow-icon">
                    <path d="m6 9 6 6 6-6"/>
                  </svg>
                </div>
              </div>
 
              <!-- Message Detail (Hidden by default) -->
              <div class="message-detail hidden px-6 py-4 bg-black/40">
                <div class="mono text-[8px] text-slate-500 leading-relaxed tracking-tight border-l border-white/10 pl-3 py-1">
                  ${window.escapeHTML(log.message || '---')}
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
        const arrow = el.querySelector('.arrow-icon');
        const isHidden = detail.classList.contains('hidden');
        detail.classList.toggle('hidden');
        arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
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
