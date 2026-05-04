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

        <div id="log-container" class="flex-grow overflow-y-auto p-4 space-y-2">
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
      const url = '/api/audit?limit=50';
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
        if (this.logs.length > 500) this.logs.pop();
        
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
    div.className = `t-panel p-4 border-l-4 ${this.getColorClass(log.type)} hover:bg-white/5 cursor-pointer `;
    div.innerHTML = `
      <div class="flex justify-between mb-2">
        <span class="text-[9px] font-mono text-slate-500">${new Date(log.timestamp).toLocaleTimeString()}</span>
        <span class="mono text-[9px] font-black uppercase tracking-widest ${this.getTextClass(log.type)}">${log.type}</span>
      </div>
      <div class="text-[11px] font-bold text-slate-300">${log.message}</div>
    `;
    return div;
  }

  prependLog(log) {
    if (!this.container) return;
    const el = this.createLogElement(log);
    this.container.prepend(el);
    if (this.container.children.length > 100) {
        this.container.lastElementChild.remove();
    }
  }

  appendLog(log) {
    if (!this.container) return;
    const el = this.createLogElement(log);
    this.container.appendChild(el);
  }

  getColorClass(type) {
    if (type === 'BLOCK' || type === 'THREAT') return 'border-danger';
    if (type === 'WARN') return 'border-warning';
    return 'border-primary';
  }

  getTextClass(type) {
    if (type === 'BLOCK' || type === 'THREAT') return 'text-danger';
    if (type === 'WARN') return 'text-warning';
    return 'text-primary';
  }
}

if (!customElements.get('blocking-log')) {
  customElements.define('blocking-log', BlockingLog);
}
