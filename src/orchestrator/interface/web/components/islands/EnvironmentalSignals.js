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
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const resp = await fetch('/api/network/discovery', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
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
        <!-- 📡 Unified Signal Matrix Header -->
        <div class="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
           <div class="flex gap-4 p-1.5 bg-black/40 border border-white/5 rounded-2xl self-start backdrop-blur-3xl shadow-2xl">
             ${this.renderFilterBtn('ALL', 'All Signals', totalCount)}
             ${this.renderFilterBtn('WIFI', 'WiFi APs', wifiCount)}
             ${this.renderFilterBtn('BT', 'Bluetooth', btCount)}
             ${this.renderFilterBtn('FRIENDS', 'Nearby Devices', friendsCount)}
           </div>

           <div class="flex items-center gap-8 px-8 py-3 bg-primary/5 border border-primary/20 rounded-2xl">
              <div class="flex flex-col">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest mb-1">Spectrum_Density</span>
                 <span class="mono-md text-white font-black italic tracking-tighter">${totalCount > 15 ? 'CRITICAL' : (totalCount > 8 ? 'CONGESTED' : 'STABLE')}</span>
              </div>
              <div class="w-px h-8 bg-white/10"></div>
              <div class="flex flex-col">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest mb-1">Threat_Threshold</span>
                 <span class="mono-md text-success font-black italic tracking-tighter">98.2% TRUST</span>
              </div>
           </div>
        </div>

        ${this.renderGridSection()}
      </div>
    `;
  }

  renderGridSection() {
    const gridClass = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8 gap-3";

    if (this.filter === 'ALL') {
      return `
        <div class="flex flex-col gap-12">
          <section>
            <h3 class="mono-xs font-black text-slate-500 uppercase tracking-[0.5em] mb-6 flex items-center gap-4">
              Ambient_Signal_Matrix
              <div class="flex-grow h-px bg-white/5"></div>
            </h3>
            <div class="${gridClass}">
              ${this.renderSpecificSignals(['WIFI', 'BT'])}
            </div>
          </section>

          <section>
            <h3 class="mono-xs font-black text-slate-500 uppercase tracking-[0.5em] mb-6 flex items-center gap-4">
              Network_Asset_Discovery
              <div class="flex-grow h-px bg-white/5"></div>
            </h3>
            <div class="${gridClass}">
              ${this.renderSpecificSignals(['FRIEND', 'MESH'])}
            </div>
          </section>
        </div>
      `;
    }

    return `
      <div class="${gridClass}">
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
    
    // UI Density Optimization: Super-compact Matrix Card
    return `
      <div class="glass-panel group relative p-3 bg-black/40 border border-white/5 hover:border-white/15 transition-all duration-300 hover:bg-white/[0.01]">
        <div class="flex justify-between items-center mb-3">
          <div class="flex items-center gap-2">
             <div class="w-6 h-6 rounded bg-black/60 border border-white/5 flex items-center justify-center group-hover:border-primary/20 transition-colors">
                ${this.getVectorIconSmall(s.vector)}
             </div>
             <span class="mono text-[6px] font-black text-slate-600 uppercase tracking-widest">${s.vector}</span>
          </div>
          <span class="mono text-[7px] font-black uppercase" style="color: ${trustColor}">${trustScore}%</span>
        </div>

        <div class="mb-3">
          <h4 class="text-xs font-black text-white italic truncate" title="${s.ssid || s.hostname || s.name}">
            ${s.ssid || s.hostname || s.name || 'ANONYMOUS'}
          </h4>
          <span class="mono text-[6px] font-bold text-slate-500 uppercase truncate block mt-0.5">${s.mac?.toUpperCase() || 'UNKNOWN'}</span>
        </div>

        <div class="space-y-1 mb-3">
           ${s.ip ? `<div class="flex justify-between mono text-[7px] font-black"><span class="text-slate-600">IP</span><span class="text-primary">${s.ip}</span></div>` : ''}
           <div class="flex justify-between mono text-[7px] font-black"><span class="text-slate-600">AUTH</span><span class="text-slate-300 truncate max-w-[50px]">${s.encryption || s.type || 'OPEN'}</span></div>
           ${(isFriend || isMesh) ? `<div class="flex justify-between mono text-[7px] font-black"><span class="text-slate-600">DEVS</span><span class="text-success">${Math.floor(Math.random() * 5) + 1}</span></div>` : ''}
        </div>

        <div class="flex items-center gap-2 pt-2 border-t border-white/5">
           <div class="flex-grow h-0.5 bg-white/5 rounded-full overflow-hidden flex gap-0.5">
              ${this.renderSignalBars(isMesh || isFriend ? 100 : s.signal, themeColor)}
           </div>
        </div>
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
