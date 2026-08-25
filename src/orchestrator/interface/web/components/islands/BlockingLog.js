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

    // Both controls live inside the non-compact branch of the template above, so in
    // compact mode these are null and assigning to them aborted connectedCallback,
    // taking the whole island down.
    if (this.filterEl) this.filterEl.onchange = (e) => {
      this.filter = e.target.value;
      this.rebuildList();
    };

    if (this.form) this.form.onsubmit = async (e) => {
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
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch(url, {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
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
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const socket = new SharedWebSocket();
    
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
    const timestamp = new Date(log.timestamp);
    const timeStr = timestamp.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const msStr = String(timestamp.getMilliseconds()).padStart(3, '0');
    const dateStr = timestamp.toLocaleDateString([], { month: 'short', day: '2-digit' });

    const severityColor = this.getSeverityColorClass(severity);
    const severityTextClass = this.getSeverityTextClass(severity);
    
    div.className = `flex flex-col border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group cursor-pointer`;
    
    // SEC-03: DOM-based XSS Hardening.
    // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
    const row = document.createElement('div');
    row.className = "flex items-center gap-4 py-3 px-6 relative overflow-hidden";

    const indicator = document.createElement('div');
    indicator.className = `absolute inset-y-0 left-0 w-1 ${severityColor} opacity-30 group-hover:opacity-100 transition-opacity`;
    row.appendChild(indicator);

    const tsEl = document.createElement('div');
    tsEl.className = "w-36 flex-shrink-0 mono text-[9px] font-black text-slate-500 tabular-nums";

    const dateSpan = document.createElement('span');
    dateSpan.textContent = dateStr;
    tsEl.appendChild(dateSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = "ml-2 text-slate-400";
    timeSpan.textContent = timeStr;

    const msSpan = document.createElement('span');
    msSpan.className = "text-slate-600";
    msSpan.textContent = `.${msStr}`;
    timeSpan.appendChild(msSpan);

    tsEl.appendChild(timeSpan);
    row.appendChild(tsEl);

    const typeEl = document.createElement('div');
    typeEl.className = "w-24 flex-shrink-0 mono text-[9px] font-black uppercase tracking-widest text-slate-400";
    typeEl.textContent = type;
    row.appendChild(typeEl);

    const callerEl = document.createElement('div');
    callerEl.className = "w-40 flex-shrink-0 mono text-[9px] font-black text-slate-500 truncate uppercase tracking-tight";
    callerEl.textContent = log.caller || 'SYSTEM';
    row.appendChild(callerEl);

    const sevEl = document.createElement('div');
    sevEl.className = `w-24 flex-shrink-0 mono text-[9px] font-black uppercase tracking-widest ${severityTextClass}`;
    sevEl.textContent = severity;
    row.appendChild(sevEl);

    const msgEl = document.createElement('div');
    msgEl.className = "flex-grow min-w-0 text-[10px] font-medium text-slate-300 tracking-wide truncate";
    msgEl.textContent = log.message || '---';
    row.appendChild(msgEl);

    const iconEl = document.createElement('div');
    iconEl.className = "flex-shrink-0 opacity-20 group-hover:opacity-100 transition-opacity";
    iconEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="transform transition-transform duration-300 arrow-icon"><path d="m6 9 6 6 6-6"/></svg>`;
    row.appendChild(iconEl);

    const detail = document.createElement('div');
    detail.className = "log-detail hidden px-12 pb-6 pt-2 animate-in fade-in slide-in-from-top-2 duration-300";

    const detailInner = document.createElement('div');
    detailInner.className = "bg-black/40 border border-white/5 rounded-xl p-4 overflow-x-auto custom-scrollbar";

    if (log.data?.intent) {
        const intentEl = document.createElement('div');
        intentEl.className = "mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg";

        const intentHeader = document.createElement('div');
        intentHeader.className = "flex items-center gap-2 mb-1";

        const dot = document.createElement('div');
        dot.className = "w-1.5 h-1.5 bg-danger rounded-full animate-pulse";
        intentHeader.appendChild(dot);

        const label = document.createElement('span');
        label.className = "mono text-[9px] font-black text-danger uppercase tracking-widest";
        label.textContent = "Behavioral_Intent_Verdict";
        intentHeader.appendChild(label);

        intentEl.appendChild(intentHeader);

        const intentBody = document.createElement('div');
        intentBody.className = "mono text-[10px] text-slate-300 uppercase font-bold";
        intentBody.appendChild(document.createTextNode("Intent: "));

        const intentVal = document.createElement('span');
        intentVal.className = "text-danger";
        intentVal.textContent = log.data.intent;
        intentBody.appendChild(intentVal);

        intentBody.appendChild(document.createTextNode(" // Confidence: "));

        const confVal = document.createElement('span');
        confVal.className = "text-white";
        confVal.textContent = `${(log.data.score * 100).toFixed(0)}%`;
        intentBody.appendChild(confVal);

        intentEl.appendChild(intentBody);
        detailInner.appendChild(intentEl);
    }

    const payloadHeader = document.createElement('div');
    payloadHeader.className = "flex items-center gap-2 mb-3";

    const decoration = document.createElement('div');
    decoration.className = "w-1 h-3 bg-primary/40 rounded-full";
    payloadHeader.appendChild(decoration);

    const payloadLabel = document.createElement('span');
    payloadLabel.className = "mono-xs font-black text-slate-500 uppercase tracking-widest";
    payloadLabel.textContent = "Extended_Payload";
    payloadHeader.appendChild(payloadLabel);

    detailInner.appendChild(payloadHeader);

    const pre = document.createElement('pre');
    pre.className = "mono text-[8.5px] text-primary/80 leading-relaxed whitespace-pre-wrap";
    pre.textContent = JSON.stringify(log.payload || log, null, 2);
    detailInner.appendChild(pre);

    detail.appendChild(detailInner);

    div.appendChild(row);
    div.appendChild(detail);

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
