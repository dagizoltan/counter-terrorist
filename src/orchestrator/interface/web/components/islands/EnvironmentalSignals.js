class EnvironmentalSignals extends HTMLElement {
  constructor() {
    super();
    this.signals = { wifi: [], bluetooth: [], ethernet: [] };
    this.filter = 'ALL';
  }

  async connectedCallback() {
    await this.fetchSignals();
    this.render();
    this.startAutoRefresh();
  }

  async fetchSignals() {
    try {
      const resp = await fetch('/api/network/discovery');
      if (resp.ok) {
        this.signals = await resp.json();
      }
    } catch (e) {
      console.error('Failed to fetch environmental signals:', e);
    }
  }

  startAutoRefresh() {
    this.refreshInterval = setInterval(async () => {
      await this.fetchSignals();
      this.render();
    }, 10000);
  }

  disconnectedCallback() {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  render() {
    const wifiCount = this.signals.wifi?.length || 0;
    const btCount = this.signals.bluetooth?.length || 0;
    const ethCount = this.signals.ethernet?.length || 0;

    this.innerHTML = `
      <div class="flex flex-col gap-6 animate-in fade-in duration-1000">
        <!-- TACTICAL SELECTOR -->
        <div class="flex gap-2 p-1 bg-black/40 border border-white/5 rounded-xl self-start backdrop-blur-xl">
          <button class="px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all ${this.filter === 'ALL' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-300'}" onclick="this.closest('environmental-signals').setFilter('ALL')">All Signals (${wifiCount + btCount + ethCount})</button>
          <button class="px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all ${this.filter === 'WIFI' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-300'}" onclick="this.closest('environmental-signals').setFilter('WIFI')">WiFi APs (${wifiCount})</button>
          <button class="px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all ${this.filter === 'BT' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-300'}" onclick="this.closest('environmental-signals').setFilter('BT')">Bluetooth (${btCount})</button>
          <button class="px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] transition-all ${this.filter === 'FRIENDS' ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-slate-500 hover:text-slate-300'}" onclick="this.closest('environmental-signals').setFilter('FRIENDS')">Friends (${ethCount})</button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          ${this.renderSignals()}
        </div>
      </div>
    `;
  }

  setFilter(f) {
    this.filter = f;
    this.render();
  }

  renderSignals() {
    let list = [];
    if (this.filter === 'ALL' || this.filter === 'WIFI') {
      list = list.concat((this.signals.wifi || []).map(s => ({ ...s, vector: 'WIFI' })));
    }
    if (this.filter === 'ALL' || this.filter === 'BT') {
      list = list.concat((this.signals.bluetooth || []).map(s => ({ ...s, vector: 'BT' })));
    }
    if (this.filter === 'ALL' || this.filter === 'FRIENDS') {
      list = list.concat((this.signals.ethernet || []).map(s => ({ ...s, vector: 'FRIEND' })));
    }

    if (list.length === 0) {
      return `
        <div class="col-span-full py-20 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-3xl bg-white/[0.02]">
          <div class="w-12 h-12 rounded-full border-2 border-white/5 flex items-center justify-center mb-4 animate-pulse">
            <div class="w-2 h-2 rounded-full bg-primary"></div>
          </div>
          <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">No ambient signals captured in this vector</span>
        </div>
      `;
    }

    return list.map(s => this.renderSignalCard(s)).join('');
  }

  renderSignalCard(s) {
    const isWifi = s.vector === 'WIFI';
    const isBT = s.vector === 'BT';
    const isFriend = s.vector === 'FRIEND';

    const color = isWifi ? 'var(--primary)' : isBT ? 'var(--warning)' : 'var(--success)';
    const icon = isWifi ? 'signal' : isBT ? 'bluetooth' : 'users';

    return `
      <div class="glass-panel p-6 border-l-4 hover:bg-white/[0.04] transition-all group" style="border-left-color: ${color}">
        <div class="flex justify-between items-start mb-4">
          <div class="flex flex-col">
            <span class="mono-xs font-black uppercase tracking-[0.3em] opacity-40 mb-1">${s.vector} // ${s.mac?.toUpperCase() || 'UNKNOWN_MAC'}</span>
            <h4 class="tactical-title text-xl text-white group-hover:text-primary transition-colors">${s.ssid || s.hostname || s.name || 'ANONYMOUS_ENTITY'}</h4>
          </div>
          <div class="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-400">
             ${this.getVectorIcon(s.vector)}
          </div>
        </div>

        <div class="flex items-center gap-4 mt-6 pt-4 border-t border-white/5">
          <div class="flex-grow">
            <div class="flex justify-between mb-1">
              <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Signal Integrity</span>
              <span class="text-[8px] font-black uppercase tracking-widest" style="color: ${color}">${s.signal || 0}%</span>
            </div>
            <div class="h-1 bg-white/5 rounded-full overflow-hidden">
               <div class="h-full bg-current transition-all duration-1000" style="width: ${s.signal || 0}%; color: ${color}; box-shadow: 0 0 10px ${color}"></div>
            </div>
          </div>
          <button class="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition-colors">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4h-4Z"/></svg>
          </button>
        </div>
      </div>
    `;
  }

  getVectorIcon(vector) {
    if (vector === 'WIFI') return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>';
    if (vector === 'BT') return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m7 7 10 10-5 5V2l5 5L7 17"/></svg>';
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }
}

customElements.define('environmental-signals', EnvironmentalSignals);
