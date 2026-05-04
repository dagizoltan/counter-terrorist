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
    const color = this.getColorClass(log.type);
    div.className = `flex gap-4 py-1.5 px-4 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group relative overflow-hidden`;
    div.innerHTML = `
      <div class="absolute inset-y-0 left-0 w-1 ${color} opacity-0 group-hover:opacity-100 transition-opacity"></div>
      <div class="flex flex-col w-24 flex-shrink-0">
        <span class="mono text-[10px] font-black text-slate-500 tabular-nums">${new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}</span>
        <span class="mono text-[8px] text-slate-700">${new Date(log.timestamp).toLocaleDateString()}</span>
      </div>
      <div class="flex flex-col gap-1 flex-grow">
        <div class="flex items-center gap-3">
          <span class="mono text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded bg-white/5 border border-white/10 ${this.getTextClass(log.type)}">${log.type}</span>
          <span class="text-[11px] font-bold text-slate-300 tracking-wide">${log.message}</span>
        </div>
        ${log.actor ? `
          <div class="flex items-center gap-4 opacity-40 group-hover:opacity-100 transition-opacity">
            <div class="flex items-center gap-1.5">
              <span class="mono text-[8px] text-slate-500 uppercase">Actor:</span>
              <span class="mono text-[8px] text-primary font-black uppercase">${log.actor.id}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="mono text-[8px] text-slate-500 uppercase">IP:</span>
              <span class="mono text-[8px] text-slate-400 tabular-nums">${log.actor.ip}</span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    return div;
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

  getColorClass(type) {
    if (type === 'BLOCK' || type === 'THREAT' || type === 'CRITICAL') return 'bg-danger';
    if (type === 'WARN' || type === 'WARNING') return 'bg-warning';
    return 'bg-primary';
  }

  getTextClass(type) {
    if (type === 'BLOCK' || type === 'THREAT' || type === 'CRITICAL') return 'text-danger';
    if (type === 'WARN' || type === 'WARNING') return 'text-warning';
    return 'text-primary';
  }
}

if (!customElements.get('blocking-log')) {
  customElements.define('blocking-log', BlockingLog);
}
