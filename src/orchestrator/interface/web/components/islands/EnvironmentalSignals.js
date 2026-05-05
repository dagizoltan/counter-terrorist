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
    const glow = isWifi ? 'shadow-primary/10' : isBT ? 'shadow-warning/10' : 'shadow-success/10';
    
    const meta = [];
    if (isWifi) {
      meta.push(`CH: ${s.channel || '?'}`);
      meta.push(`${s.band || ''}`);
      meta.push(`${s.encryption || 'OPEN'}`);
    } else if (isBT) {
      meta.push(`${s.type || 'DEVICE'}`);
      if (s.battery) meta.push(`BAT: ${s.battery}`);
    } else if (isFriend) {
      meta.push(`IP: ${s.ip || '0.0.0.0'}`);
      if (s.isMeshNode) meta.push('MESH_PEER');
    }

    return `
      <div class="glass-panel p-5 border border-white/5 hover:border-${isWifi ? 'primary' : isBT ? 'warning' : 'success'}/30 hover:bg-white/[0.03] transition-all group relative overflow-hidden shadow-xl ${glow}">
        <div class="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
          ${this.getVectorIcon(s.vector)}
        </div>

        <!-- Header -->
        <div class="flex flex-col mb-4">
          <div class="flex items-center gap-2 mb-1">
             <span class="mono text-[8px] font-black uppercase tracking-widest text-slate-500">${s.vector}</span>
             <span class="w-1 h-1 rounded-full bg-white/20"></span>
             <span class="mono text-[8px] font-black uppercase tracking-widest text-slate-500">${s.mac?.toUpperCase() || 'UNKNOWN'}</span>
          </div>
          <h4 class="tactical-title text-lg text-white group-hover:text-${isWifi ? 'primary' : isBT ? 'warning' : 'success'} transition-colors truncate">
            ${s.ssid || s.hostname || s.name || 'ANONYMOUS_ENTITY'}
          </h4>
          <div class="flex flex-col gap-0.5 mt-1">
            <span class="mono text-[9px] font-bold text-slate-400 uppercase tracking-tighter">${s.vendor || 'Unknown Vendor'}</span>
            <span class="mono text-[7px] font-black text-primary/60 uppercase tracking-widest">${s.publicIntel || ''}</span>
          </div>
        </div>

        <!-- Tactical Metadata -->
        <div class="grid grid-cols-2 gap-2 mb-6">
          ${meta.map(m => `
            <div class="bg-black/20 border border-white/5 px-2 py-1.5 rounded flex items-center justify-center">
              <span class="mono text-[8px] font-black text-slate-300 uppercase">${m}</span>
            </div>
          `).join('')}
        </div>

        <!-- Signal Strength -->
        <div class="space-y-2">
          <div class="flex justify-between items-end">
            <span class="mono text-[8px] font-black text-slate-500 uppercase tracking-widest">Signal / RSSI</span>
            <span class="mono text-[10px] font-black" style="color: ${color}">${isBT ? (s.signal + ' dBm') : (s.signal + '%')}</span>
          </div>
          <div class="h-1 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
             ${this.renderSignalBars(s.signal, color)}
          </div>
        </div>

        <!-- Details Footer -->
        ${s.details ? `
          <div class="mt-4 pt-4 border-t border-white/5">
            <p class="mono text-[8px] text-slate-500 leading-relaxed italic uppercase">${s.details}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  renderSignalBars(signal, color) {
    const bars = 5;
    const activeBars = Math.ceil((signal < 0 ? (100 + signal) : signal) / (100 / bars));
    let html = '';
    for (let i = 0; i < bars; i++) {
        const opacity = i < activeBars ? '1' : '0.1';
        html += `<div class="flex-grow h-full transition-all duration-500" style="background: ${color}; opacity: ${opacity}; box-shadow: ${i < activeBars ? `0 0 5px ${color}` : 'none'}"></div>`;
    }
    return html;
  }

  getVectorIcon(vector) {
    if (vector === 'WIFI') return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-primary"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>';
    if (vector === 'BT') return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-warning"><path d="m7 7 10 10-5 5V2l5 5L7 17"/></svg>';
    return '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="text-success"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
  }
}

customElements.define('environmental-signals', EnvironmentalSignals);
