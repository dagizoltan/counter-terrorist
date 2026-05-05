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
      list = list.concat((this.signals.mesh || []).map(s => ({ ...s, vector: 'MESH' })));
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
    const isMesh = s.vector === 'MESH';

    // Simulated Integrity Score
    let trustScore = 85;
    if (s.publicIntel?.includes('Randomized')) trustScore -= 30;
    if (s.publicIntel?.includes('Unknown')) trustScore -= 15;
    if (s.signal < -80) trustScore -= 10;
    if (isMesh) trustScore = 99; // Mesh nodes are verified
    trustScore = Math.max(10, Math.min(99, trustScore));

    const themeColor = isWifi ? 'var(--primary)' : isBT ? 'var(--warning)' : 'var(--success)';
    const trustColor = trustScore > 70 ? 'var(--success)' : trustScore > 40 ? 'var(--warning)' : 'var(--danger)';
    const trustStatus = trustScore > 70 ? 'Optimal' : trustScore > 40 ? 'Caution' : 'Untrusted';
    
    const meta = [];
    if (isWifi) {
      meta.push({ label: 'CH', value: s.channel || '?' });
      meta.push({ label: 'BND', value: s.band || '2.4G' });
      meta.push({ label: 'ENC', value: s.encryption || 'OPEN' });
    } else if (isBT) {
      meta.push({ label: 'TYP', value: s.type || 'DEVICE' });
      if (s.battery) meta.push({ label: 'BAT', value: s.battery });
      meta.push({ label: 'ADR', value: 'LE_PUB' });
    } else if (isFriend || isMesh) {
      meta.push({ label: 'IP', value: s.ip || '?.?.?.?' });
      meta.push({ label: 'NET', value: isMesh ? 'MESH' : 'LOCAL' });
      meta.push({ label: 'AUTH', value: isMesh ? 'VFRD' : 'NONE' });
    }

    return `
      <div class="glass-panel group relative flex flex-col p-8 bg-black/40 border border-white/5 hover:border-white/20 transition-all duration-300 hover:bg-white/[0.03] shadow-2xl">
        {/* Top Operational Header */}
        <div class="flex justify-between items-start mb-10">
          <div class="flex items-center gap-4">
            <div class="p-3 bg-black/60 rounded-xl border border-white/10 group-hover:border-${isWifi ? 'primary' : isBT ? 'warning' : 'success'}/40 transition-colors">
              ${this.getVectorIconSmall(s.vector)}
            </div>
            <div class="flex flex-col gap-1">
              <span class="mono text-[7px] font-black text-slate-500 uppercase tracking-[0.3em]">${s.vector} // ${s.mac?.toUpperCase() || 'UNKNOWN_ADDR'}</span>
              <span class="mono text-[9px] font-black text-slate-400 uppercase tracking-tighter">${s.vendor || 'Unknown_Manufacturer'}</span>
            </div>
          </div>
          <div class="flex flex-col items-end gap-2">
            <span class="status-pill active !px-4 !py-1 text-[9px] font-black uppercase tracking-[0.2em]" style="background: ${trustColor}20; color: ${trustColor}; border-color: ${trustColor}40">
               ${trustStatus}
            </span>
            <div class="flex items-center gap-2">
               <span class="mono text-[7px] font-black text-slate-600 uppercase">Trust_${trustScore}%</span>
               <div class="w-1.5 h-1.5 rounded-full" style="background: ${trustColor}; box-shadow: 0 0 8px ${trustColor}"></div>
            </div>
          </div>
        </div>

        {/* Primary Identification */}
        <div class="mb-10 flex-grow">
          <h4 class="text-3xl font-black text-white italic tracking-tighter uppercase leading-none mb-3 group-hover:translate-x-1 transition-transform">
            ${s.ssid || s.hostname || s.name || 'ANONYMOUS_ENTITY'}
          </h4>
          <span class="mono text-[9px] font-black text-primary/40 uppercase tracking-[0.2em] italic">${s.publicIntel?.replace(/_/g, ' ') || 'STANDARD_NODE_IDENTIFIED'}</span>
        </div>

        {/* Technical Attributes Grid */}
        <div class="grid grid-cols-3 gap-3 mb-10">
          ${meta.map(m => `
            <div class="bg-black/60 border border-white/5 p-3 rounded-xl flex flex-col gap-1">
               <span class="mono text-[6px] font-black text-slate-600 uppercase tracking-widest">${m.label}</span>
               <span class="mono text-[9px] font-black text-slate-300 uppercase truncate">${m.value}</span>
            </div>
          `).join('')}
        </div>

        {/* Telemetry Block */}
        <div class="bg-black/80 p-5 rounded-2xl border border-white/5 mb-8">
          <div class="flex justify-between items-end mb-3">
             <span class="mono text-[7px] font-black text-slate-500 uppercase tracking-[0.5em]">Signal_Magnitude</span>
             <span class="mono text-[12px] font-black tabular-nums italic" style="color: ${themeColor}">${isBT ? (s.signal + ' dBm') : isMesh ? 'VFRD' : (s.signal + '%')}</span>
          </div>
          <div class="h-1.5 bg-white/5 rounded-full overflow-hidden flex gap-1">
             ${this.renderSignalBars(isMesh ? 100 : s.signal, themeColor)}
          </div>
        </div>

        {/* Action / Forensic Footer */}
        <div class="pt-6 border-t border-white/5 flex justify-between items-center opacity-40 group-hover:opacity-100 transition-all">
           <div class="flex items-center gap-3">
              <div class="p-1.5 bg-white/5 rounded border border-white/10">
                 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="text-slate-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <span class="mono text-[7px] font-black text-slate-500 uppercase tracking-[0.3em]">Forensic_Capture_Ready</span>
           </div>
           <svg class="transition-transform group-hover:translate-x-1" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </div>
      </div>
    `;
  }

  getVectorIconSmall(vector) {
    if (vector === 'WIFI') return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5"><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>';
    if (vector === 'BT') return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2.5"><path d="m7 7 10 10-5 5V2l5 5L7 17"/></svg>';
    if (vector === 'MESH') return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>';
  }

  renderSignalBars(signal, color) {
    const bars = 12;
    const activeBars = Math.ceil((signal < 0 ? (100 + signal) : signal) / (100 / bars));
    let html = '';
    for (let i = 0; i < bars; i++) {
        const opacity = i < activeBars ? (0.2 + (i / bars) * 0.8) : 0.03;
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
