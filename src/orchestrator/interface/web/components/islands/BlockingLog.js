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
    this.innerHTML = `
      <div class="flex flex-col h-full bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
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

        <div id="log-container" class="flex-grow overflow-y-auto p-4 space-y-1">
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
      await fetch('/api/infrastructure/system/protection/firewall/block', {
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
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.logs.unshift(data);
        if (this.logs.length > 2000) this.logs.pop();
        
        // Only prepend if it matches the current filter
        if (this.filter === 'ALL' || data.type === this.filter) {
          this.prependLog(data);
        }
      } catch (e) {}
    };
    socket.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  rebuildList() {
    if (!this.container) return;
    this.container.innerHTML = '';
    const filteredLogs = this.filter === 'ALL'
      ? this.logs
      : this.logs.filter(log => log.type === this.filter);
    
    filteredLogs.forEach(log => this.appendLog(log));
  }

  createLogElement(log) {
    const div = document.createElement('div');
    const severity = (log.severity || 'info').toLowerCase();
    const type = (log.type || 'generic').toUpperCase();
    const caller = (log.caller || log.actor?.id || 'SYSTEM').toUpperCase();
    
    const severityColor = this.getSeverityColorClass(severity);
    const typeColor = this.getTypeColorClass(type);
    
    // Use the pre-formatted string from backend if available, otherwise reconstruct it
    const formatted = log.formatted || `[${type}] [${severity}] [${caller}] ${log.message}`;
    const [brackets, ...messageParts] = formatted.split(']');
    const bracketSection = brackets + ']';
    const messageSection = messageParts.join(']').trim();

    div.className = `flex items-center gap-6 py-2.5 px-6 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group relative overflow-hidden`;
    div.innerHTML = `
      <div class="absolute inset-y-0 left-0 w-1 ${severityColor} opacity-30 group-hover:opacity-100 transition-opacity"></div>
      
      <!-- 01 Timestamp -->
      <div class="flex flex-col w-28 flex-shrink-0">
        <span class="mono text-[10px] font-black text-slate-400 tabular-nums">${new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}<span class="text-slate-600">.${String(new Date(log.timestamp).getMilliseconds()).padStart(3, '0')}</span></span>
        <span class="mono text-[8px] text-slate-700 font-bold uppercase tracking-tighter">${new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' })}</span>
      </div>

      <!-- 02 Compliant Taxonomy Block -->
      <div class="flex-grow min-w-0 flex items-baseline gap-3">
        <span class="mono text-[10px] font-black uppercase tracking-[0.1em] ${this.getSeverityTextClass(severity)} whitespace-nowrap">
          ${window.escapeHTML(bracketSection)}
        </span>
        <p class="text-[11px] font-medium text-slate-300 tracking-wide truncate group-hover:whitespace-normal transition-all duration-300">
          ${window.escapeHTML(messageSection)}
        </p>
      </div>

      <!-- 03 Actor Payload (Hidden by default, shown on hover/detail) -->
      ${log.actor?.ip ? `
        <div class="flex items-center gap-2 px-3 py-1 bg-primary/5 border border-primary/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ml-auto flex-shrink-0">
          <span class="mono text-[8px] text-primary font-black uppercase">IP: ${log.actor.ip}</span>
        </div>
      ` : ''}
    `;
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
    const el = this.createLogElement(log);
    this.container.prepend(el);
    if (this.container.children.length > 2000) {
        this.container.lastElementChild.remove();
    }
  }

  appendLog(log) {
    if (!this.container) return;
    const el = this.createLogElement(log);
    this.container.appendChild(el);
  }


}

if (!customElements.get('blocking-log')) {
  customElements.define('blocking-log', BlockingLog);
}
