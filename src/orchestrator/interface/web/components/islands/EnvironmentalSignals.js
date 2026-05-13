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
        const data = await resp.json();
        this.signals = {
          wifi: data.wifi || [],
          bluetooth: data.bluetooth || [],
          ethernet: data.ethernet || [],
          mesh: data.mesh || []
        };
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
    const meshCount = this.signals.mesh?.length || 0;
    const friendsCount = ethCount + meshCount;
    const totalCount = wifiCount + btCount + friendsCount;

    this.innerHTML = `
      <div class="flex flex-col gap-10 animate-in fade-in duration-1000">
        <!-- TACTICAL SELECTOR -->
        <div class="flex gap-4 p-1.5 bg-black/40 border border-white/5 rounded-2xl self-start backdrop-blur-3xl shadow-2xl">
          ${this.renderFilterBtn('ALL', 'All Signals', totalCount)}
          ${this.renderFilterBtn('WIFI', 'WiFi APs', wifiCount)}
          ${this.renderFilterBtn('BT', 'Bluetooth', btCount)}
          ${this.renderFilterBtn('FRIENDS', 'Nearby Devices', friendsCount)}
        </div>

        ${this.renderGridSection()}
      </div>
    `;
  }

  renderGridSection() {
    if (this.filter === 'ALL') {
      return `
        <div class="flex flex-col gap-12">
          <section>
            <h3 class="mono-xs font-black text-slate-500 uppercase tracking-[0.5em] mb-6 flex items-center gap-4">
              Ambient_Signal_Matrix
              <div class="flex-grow h-px bg-white/5"></div>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              ${this.renderSpecificSignals(['WIFI', 'BT'])}
            </div>
          </section>

          <section>
            <h3 class="mono-xs font-black text-slate-500 uppercase tracking-[0.5em] mb-6 flex items-center gap-4">
              Network_Asset_Discovery
              <div class="flex-grow h-px bg-white/5"></div>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
              ${this.renderSpecificSignals(['FRIEND', 'MESH'])}
            </div>
          </section>
        </div>
      `;
    }

    return `
      <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        ${this.renderSignals()}
      </div>
    `;
  }

  renderSpecificSignals(vectors) {
    let list = [];
    if (vectors.includes('WIFI')) list = list.concat((this.signals.wifi || []).map(s => ({ ...s, vector: 'WIFI' })));
    if (vectors.includes('BT')) list = list.concat((this.signals.bluetooth || []).map(s => ({ ...s, vector: 'BT' })));
    if (vectors.includes('FRIEND')) list = list.concat((this.signals.ethernet || []).map(s => ({ ...s, vector: 'FRIEND' })));
    if (vectors.includes('MESH')) list = list.concat((this.signals.mesh || []).map(s => ({ ...s, vector: 'MESH' })));

    if (list.length === 0) {
      return `
        <div class="col-span-full py-16 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-3xl bg-white/[0.01]">
          <span class="mono-xs font-black text-slate-600 uppercase tracking-[0.3em]">No signals detected in this cluster</span>
        </div>
      `;
    }
    return list.map(s => this.renderSignalCard(s)).join('');
  }

  renderFilterBtn(f, label, count) {
    const active = this.filter === f;
    return `
      <button class="px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.3em] transition-all duration-300 ${active ? 'bg-white/10 text-white shadow-xl border border-white/10' : 'text-slate-500 hover:text-slate-300'}" 
              onclick="this.closest('environmental-signals').setFilter('${f}')">
        ${label} <span class="ml-2 opacity-40 italic font-bold">(${count})</span>
      </button>
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
      list = list.concat((this.signals.mesh || []).map(s => ({ ...s, vector: 'MESH' })));
    }

    if (list.length === 0) {
      return `
        <div class="col-span-full py-32 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-3xl bg-white/[0.01]">
          <div class="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mb-6 animate-pulse">
            <div class="w-3 h-3 rounded-full bg-warning shadow-[0_0_15px_var(--warning)]"></div>
          </div>
          <span class="mono-xs font-black text-slate-600 uppercase tracking-[0.5em]">No ambient signals captured in this vector</span>
        </div>
      `;
    }

    return list.map(s => this.renderSignalCard(s)).join('');
  }

  renderSignalCard(s) {
    const isWifi = s.vector === 'WIFI';
    const isBT = s.vector === 'BT';
    const isFriend = s.vector === 'FRIEND';
    const isMesh = s.vector === 'MESH';

    // Trust Score Calculation
    let trustScore = 85;
    if (s.publicIntel?.includes('Randomized')) trustScore -= 30;
    if (s.publicIntel?.includes('Unknown')) trustScore -= 15;
    if (s.signal < -80) trustScore -= 10;
    if (isMesh) trustScore = 99;
    trustScore = Math.max(10, Math.min(99, trustScore));

    const themeColor = isWifi ? 'var(--primary)' : isBT ? 'var(--warning)' : 'var(--success)';
    const trustColor = trustScore > 70 ? 'var(--success)' : trustScore > 40 ? 'var(--warning)' : 'var(--danger)';
    
    return `
      <div class="glass-panel group relative p-4 bg-black/40 border border-white/5 hover:border-white/20 transition-all duration-500 hover:bg-white/[0.02]">
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-center gap-2">
             <div class="w-8 h-8 rounded bg-black/60 border border-white/5 flex items-center justify-center group-hover:border-white/20 transition-colors">
                ${this.getVectorIconSmall(s.vector)}
             </div>
             <div class="flex flex-col">
                <span class="mono text-[6px] font-black text-slate-500 uppercase tracking-widest">${s.vector}</span>
                <span class="mono text-[8px] font-bold text-slate-400 uppercase truncate max-w-[100px]">${s.mac?.toUpperCase() || 'UNKNOWN'}</span>
             </div>
          </div>
          <div class="flex flex-col items-end">
             <span class="mono text-[8px] font-black uppercase" style="color: ${trustColor}">${trustScore}%</span>
             <div class="w-10 h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                <div class="h-full transition-all duration-1000" style="width: ${trustScore}%; background: ${trustColor}"></div>
             </div>
          </div>
        </div>

        <div class="mb-4">
          <h4 class="text-lg font-black text-white italic tracking-tight uppercase truncate">
            ${s.ssid || s.hostname || s.name || 'ANONYMOUS'}
          </h4>
          <div class="flex justify-between items-center mt-1">
            <span class="mono text-[7px] font-bold text-slate-500 uppercase truncate max-w-[120px]">${s.vendor || s.publicIntel || 'Unknown_Source'}</span>
            ${s.ip ? `<span class="mono text-[8px] font-black text-primary">${s.ip}</span>` : ''}
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 mb-4">
           ${this.renderMiniStat('CHAN/TYPE', s.channel || s.encryption || s.type || '?')}
           ${this.renderMiniStat('SIGNAL', isBT || isWifi ? (s.signal + (isBT ? 'dBm' : '%')) : (s.state || 'ACTIVE'))}
        </div>

        <div class="flex items-center gap-2 pt-3 border-t border-white/5">
           <div class="flex-grow h-1 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
              ${this.renderSignalBars(isMesh || isFriend ? 100 : s.signal, themeColor)}
           </div>
           <span class="mono text-[6px] font-black text-slate-600 uppercase">Mag</span>
        </div>
      </div>
    `;
  }

  renderMiniStat(label, value) {
    return `
      <div class="bg-black/40 border border-white/5 p-2 rounded flex flex-col gap-0.5">
         <span class="mono text-[5px] font-black text-slate-600 uppercase tracking-widest">${label}</span>
         <span class="mono text-[9px] font-black text-slate-300 uppercase truncate">${value}</span>
      </div>
    `;
  }

  getVectorIconSmall(vector) {
    if (vector === 'WIFI') return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>';
    if (vector === 'BT') return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2.5"><path d="m7 7 10 10-5 5V2l5 5L7 17"/></svg>';
    if (vector === 'MESH') return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
  }

  renderSignalBars(signal, color) {
    const bars = 10;
    const activeBars = Math.ceil((signal < 0 ? (100 + signal) : signal) / (100 / bars));
    let html = '';
    for (let i = 0; i < bars; i++) {
        const opacity = i < activeBars ? (0.2 + (i / bars) * 0.8) : 0.05;
        html += `<div class="flex-grow h-full transition-all duration-700" style="background: ${color}; opacity: ${opacity}"></div>`;
    }
    return html;
  }

  getVectorIcon(vector) {
    // Keep the large icons for background use if needed, but the new small one is used in header
    return this.getVectorIconSmall(vector);
  }
}

customElements.define('environmental-signals', EnvironmentalSignals);
