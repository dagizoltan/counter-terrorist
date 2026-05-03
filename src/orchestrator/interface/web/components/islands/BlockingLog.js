/**
 * Custom Element: BlockingLog
 * Refactored to Global Tactical Design (No Shadow DOM)
 */
class BlockingLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
    this.filter = 'ALL';
    this.cursor = null;
    this.loading = false;
    this.hasMore = true;
  }

  connectedCallback() {
    this.loadHistory().then(() => {
        this.connect();
    });
    this.render();
  }

  async loadHistory(append = false) {
    if (this.loading) return;
    this.loading = true;
    this.render();

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const url = this.cursor 
        ? `/api/audit?limit=50&cursor=${this.cursor}`
        : '/api/audit?limit=50';
      
      const res = await fetch(url, {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await res.json();
        const newLogs = Array.isArray(data) ? data : (data.items || []);
        this.cursor = data.cursor || null;
        this.hasMore = !!this.cursor && newLogs.length > 0;
        this.logs = append ? [...this.logs, ...newLogs] : newLogs;
      }
    } catch (e) {
      console.error("Failed to load audit history:", e);
    } finally {
      this.loading = false;
      this.render();
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
        this.render();
      } catch (e) {}
    };
    socket.onclose = () => setTimeout(() => this.connect(), 5000);
  }

  render() {
    const filteredLogs = this.filter === 'ALL'
      ? this.logs
      : this.logs.filter(log => log.type === this.filter);

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

        <div class="flex-grow overflow-y-auto p-4 space-y-2">
          ${filteredLogs.map(log => `
            <div class="t-panel p-4 border-l-4 ${this.getColorClass(log.type)} hover:bg-white/5 cursor-pointer">
              <div class="flex justify-between mb-2">
                <span class="text-[9px] font-mono text-slate-500">${new Date(log.timestamp).toLocaleTimeString()}</span>
                <span class="mono text-[9px] font-black uppercase tracking-widest ${this.getTextClass(log.type)}">${log.type}</span>
              </div>
              <div class="text-[11px] font-bold text-slate-300">${log.message}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const filter = this.querySelector('#severity-filter');
    if (filter) {
      filter.value = this.filter;
      filter.onchange = (e) => {
        this.filter = e.target.value;
        this.render();
      };
    }

    const form = this.querySelector('#block-form');
    if (form) {
      form.onsubmit = async (e) => {
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

customElements.define('blocking-log', BlockingLog);
