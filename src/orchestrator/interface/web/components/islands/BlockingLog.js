/**
 * Custom Element: BlockingLog
 * Optimized for High-Frequency Real-time Telemetry (Reduced DOM thrashing)
 */
class BlockingLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
    this.filter = 'ALL';
    this.cursor = null;
    this.loading = false;
  }

  connectedCallback() {
    this.renderBase();
    this.loadHistory().then(() => {
        this.connect();
    });
  }

  renderBase() {
    const isCompact = this.getAttribute('compact') === 'true';
    const limit = parseInt(this.getAttribute('limit') || '2000');

    this.innerHTML = `
      <div class="flex flex-col h-full ${isCompact ? '' : 'bg-black/40 rounded-3xl border border-white/5'} overflow-hidden">
        ${isCompact ? '' : `
        <div class="p-6 border-b border-white/5 bg-black/20 flex flex-col gap-4">
          <div class="flex justify-between items-center">
            <span class="mono text-[9px] font-black uppercase tracking-widest text-slate-500">Signal_Filter</span>
            <select id="severity-filter" class="bg-black/60 border border-white/10 rounded-lg p-2 mono text-[10px] uppercase outline-none cursor-pointer text-slate-300">
              <option value="ALL">ALL_SIGNALS</option>
              <option value="INFO">INFO</option>
              <option value="WARN">WARN</option>
              <option value="BLOCK">BLOCK</option>
              <option value="THREAT">THREAT</option>
            </select>
          </div>
          <form id="block-form" class="flex gap-2">
            <input type="text" id="ip-input" class="t-input mb-0 py-2 px-4 flex-grow text-[11px]" placeholder="ENFORCEMENT_IP" />
            <button type="submit" class="t-btn py-2 text-[10px]">BLOCK</button>
          </form>
        </div>
        `}

        <div id="log-container" class="flex-grow overflow-y-auto ${isCompact ? 'p-0' : 'p-4'} space-y-1">
            <!-- Real-time entries will be prepended here -->
        </div>
      </div>
    `;

    this.container = this.querySelector('#log-container');
    this.filterEl = this.querySelector('#severity-filter');
    this.form = this.querySelector('#block-form');

    this.filterEl.onchange = (e) => {
      this.filter = e.target.value;
      this.rebuildList();
    };

    this.form.onsubmit = async (e) => {
      e.preventDefault();
      const ip = this.querySelector('#ip-input').value;
      if (!ip) return;
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      await fetch('/api/defense/isolate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CT-Token': csrfToken },
        body: JSON.stringify({ ip })
      });
      this.querySelector('#ip-input').value = '';
    };
  }

  async loadHistory() {
    if (this.loading) return;
    this.loading = true;
    
    try {
      const url = '/api/audit?limit=1000';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.logs = Array.isArray(data) ? data : (data.items || []);
        this.rebuildList();
      }
    } catch (e) {
      console.error("Failed to load audit history:", e);
    } finally {
      this.loading = false;
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const socket = new SharedWebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.logs.unshift(data);
        if (this.logs.length > 2000) this.logs.pop();
        
        // Only prepend if it matches the current filter
        const isAudit = data.type === 'audit' || data.type === 'AUDIT';
        if ((this.filter === 'ALL' && !isAudit) || data.type === this.filter) {
          this.prependLog(data);
        }
      } catch (e) {}
    };
    /* Reconnection handled by SharedWebSocket */
  }

  rebuildList() {
    if (!this.container) return;
    this.container.innerHTML = '';
    const filteredLogs = this.filter === 'ALL'
      ? this.logs.filter(log => log.type !== 'audit' && log.type !== 'AUDIT')
      : this.logs.filter(log => log.type === this.filter);
    
    filteredLogs.forEach(log => this.appendLog(log));
  }

  createLogElement(log) {
    const div = document.createElement('div');
    const severity = (log.severity || 'info').toLowerCase();
    const type = (log.type || 'generic').toUpperCase();
    const timestamp = new Date(log.timestamp);
    const timeStr = timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msStr = String(timestamp.getMilliseconds()).padStart(3, '0');
    const dateStr = timestamp.toLocaleDateString([], { month: 'short', day: '2-digit' });

    const severityColor = this.getSeverityColorClass(severity);
    const severityTextClass = this.getSeverityTextClass(severity);
    
    div.className = `flex flex-col border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group cursor-pointer`;
    
    // The main row
    const rowHtml = `
      <div class="flex items-center gap-4 py-3 px-6 relative overflow-hidden">
        <div class="absolute inset-y-0 left-0 w-1 ${severityColor} opacity-30 group-hover:opacity-100 transition-opacity"></div>
        
        <!-- 01 Timestamp -->
        <div class="w-36 flex-shrink-0 mono text-[9px] font-black text-slate-500 tabular-nums">
          <span>${dateStr}</span>
          <span class="ml-2 text-slate-400">${timeStr}<span class="text-slate-600">.${msStr}</span></span>
        </div>

        <!-- 02 Type -->
        <div class="w-24 flex-shrink-0 mono text-[9px] font-black uppercase tracking-widest text-slate-400">
          ${window.escapeHTML(type)}
        </div>
        
        <!-- 02b Caller -->
        <div class="w-40 flex-shrink-0 mono text-[9px] font-black text-slate-500 truncate uppercase tracking-tight">
          ${window.escapeHTML(log.caller || 'SYSTEM')}
        </div>

        <!-- 03 Severity -->
        <div class="w-24 flex-shrink-0 mono text-[9px] font-black uppercase tracking-widest ${severityTextClass}">
          ${window.escapeHTML(severity)}
        </div>

        <!-- 04 Message -->
        <div class="flex-grow min-w-0 text-[10px] font-medium text-slate-300 tracking-wide truncate">
          ${window.escapeHTML(log.message || '---')}
        </div>

        <!-- Expand Icon -->
        <div class="flex-shrink-0 opacity-20 group-hover:opacity-100 transition-opacity">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="transform transition-transform duration-300 arrow-icon">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </div>
      </div>
    `;

    // The detail (expanded) section
    const detailHtml = `
      <div class="log-detail hidden px-12 pb-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
        <div class="bg-black/40 border border-white/5 rounded-xl p-4 overflow-x-auto custom-scrollbar">
          <div class="flex items-center gap-2 mb-3">
             <div class="w-1 h-3 bg-primary/40 rounded-full"></div>
             <span class="mono text-[8px] font-black text-slate-500 uppercase tracking-widest">Extended_Payload</span>
          </div>
          <pre class="mono text-[8.5px] text-primary/80 leading-relaxed whitespace-pre-wrap">${window.escapeHTML(JSON.stringify(log.payload || log, null, 2))}</pre>
        </div>
      </div>
    `;

    div.innerHTML = rowHtml + detailHtml;

    // Toggle logic
    div.onclick = () => {
      const detail = div.querySelector('.log-detail');
      const arrow = div.querySelector('.arrow-icon');
      const isHidden = detail.classList.contains('hidden');
      
      detail.classList.toggle('hidden');
      arrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      
      if (isHidden) {
        div.classList.add('bg-white/[0.03]');
      } else {
        div.classList.remove('bg-white/[0.03]');
      }
    };

    return div;
  }

  getSeverityColorClass(severity) {
    if (severity === 'critical' || severity === 'emergency' || severity === 'error') return 'bg-danger';
    if (severity === 'warning') return 'bg-warning';
    if (severity === 'success') return 'bg-success';
    return 'bg-primary';
  }

  getSeverityTextClass(severity) {
    if (severity === 'critical' || severity === 'emergency' || severity === 'error') return 'text-danger';
    if (severity === 'warning') return 'text-warning';
    if (severity === 'success') return 'text-success';
    return 'text-primary';
  }

  getSeverityBorderClass(severity) {
    if (severity === 'critical' || severity === 'emergency' || severity === 'error') return 'border-danger/30';
    if (severity === 'warning') return 'border-warning/30';
    if (severity === 'success') return 'border-success/30';
    return 'border-primary/30';
  }

  getTypeColorClass(type) {
    if (type === 'AUDIT' || type === 'ENFORCEMENT') return 'text-primary';
    if (type === 'THREAT' || type === 'BLOCK') return 'text-danger';
    if (type === 'INTRUSION') return 'text-warning';
    return 'text-slate-400';
  }

  prependLog(log) {
    if (!this.container) return;
    const limit = parseInt(this.getAttribute('limit') || '2000');
    const el = this.createLogElement(log);
    this.container.prepend(el);
    if (this.container.children.length > limit) {
        this.container.lastElementChild.remove();
    }
  }

  appendLog(log) {
    if (!this.container) return;
    const limit = parseInt(this.getAttribute('limit') || '2000');
    if (this.container.children.length >= limit) return;
    const el = this.createLogElement(log);
    this.container.appendChild(el);
  }


}

if (!customElements.get('blocking-log')) {
  customElements.define('blocking-log', BlockingLog);
}
