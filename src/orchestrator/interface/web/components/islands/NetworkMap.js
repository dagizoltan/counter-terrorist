/**
 * NetworkMap Island
 * Authoritative Tactical Routing Tree & Environmental Scanner.
 */
class NetworkMap extends HTMLElement {
  constructor() {
    super();
    this.devices = [];
    this.isScanning = true;
  }

  connectedCallback() {
    this.renderBase();
    this.fetchTopology();
    this.interval = setInterval(() => this.fetchTopology(), 15000);
  }

  disconnectedCallback() {
    if (this.interval) clearInterval(this.interval);
  }

  async fetchTopology() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/infrastructure/network/discovery', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await res.json();
        this.devices = Array.isArray(data) ? data : [];
        this.isScanning = false;
        this.render();
      }
    } catch (e) {
      console.error("[NETWORK-MAP] Sync failed", e);
    }
  }

  renderBase() {
    this.innerHTML = `
      <div class="space-y-12 animate-fade-in">
        <div id="mesh-core" class="space-y-8">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <div class="flex items-center gap-4">
                 <div class="w-1 h-6 bg-primary rounded shadow-primary"></div>
                 <h3 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">01_AUTHORITATIVE_MESH_CORE</h3>
              </div>
              <div id="scan-indicator" class="flex items-center gap-4 bg-primary/5 px-6 py-2 rounded-full border border-primary/20">
                 <span class="dot active shadow-primary pulse"></span>
                 <span class="mono-xs font-black text-primary uppercase tracking-[0.2em] animate-pulse">Scanning_Segment...</span>
              </div>
           </div>
           <div id="core-nodes" class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div class="col-span-2 t-panel glass-panel text-center p-32 border-dashed opacity-20">
                 <span class="mono-xs font-black uppercase tracking-[0.4em] animate-pulse text-primary">Initializing_Discovery_Chain...</span>
              </div>
           </div>
        </div>
        
        <div id="environmental-signals" class="space-y-10">
           <div class="flex items-center gap-4 mb-8 pb-4 border-b border-white/5">
              <div class="w-1 h-6 bg-slate-700 rounded shadow-sm"></div>
              <h3 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">02_AMBIENT_ENVIRONMENT_SIGNALS</h3>
           </div>
           
           <div class="grid grid-cols-12 gap-8">
              <div class="col-span-12 lg:col-span-4 space-y-6">
                 <div class="flex items-center gap-3 mb-4 p-3 bg-white/5 rounded border border-white/5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
                    <h4 class="mono-xs font-black text-white uppercase tracking-widest leading-none mt-0.5">WIFI_AP_SENSORS</h4>
                 </div>
                 <div id="wifi-nodes" class="space-y-4"></div>
              </div>
              <div class="col-span-12 lg:col-span-4 space-y-6">
                 <div class="flex items-center gap-3 mb-4 p-3 bg-white/5 rounded border border-white/5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                    <h4 class="mono-xs font-black text-white uppercase tracking-widest leading-none mt-0.5">LOCAL_ETHERNET_BUS</h4>
                 </div>
                 <div id="ethernet-nodes" class="space-y-4"></div>
              </div>
              <div class="col-span-12 lg:col-span-4 space-y-6">
                 <div class="flex items-center gap-3 mb-4 p-3 bg-white/5 rounded border border-white/5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="3"><path d="m7 7 10 10-5 5V2l5 5L7 17"/></svg>
                    <h4 class="mono-xs font-black text-white uppercase tracking-widest leading-none mt-0.5">AMBIENT_BLUETOOTH</h4>
                 </div>
                 <div id="bt-nodes" class="space-y-4"></div>
              </div>
           </div>
        </div>
      </div>
    `;
  }

  render() {
    const core = this.querySelector('#core-nodes');
    const wifi = this.querySelector('#wifi-nodes');
    const eth = this.querySelector('#ethernet-nodes');
    const bt = this.querySelector('#bt-nodes');
    const scanInd = this.querySelector('#scan-indicator');

    if (!core || !wifi || !eth || !bt) return;

    if (scanInd) {
       scanInd.style.opacity = this.isScanning ? '1' : '0.6';
       scanInd.querySelector('span').textContent = this.isScanning ? 'Scanning_Segment...' : 'Grid_Telemetry_Synced';
       scanInd.querySelector('span').classList.toggle('animate-pulse', this.isScanning);
    }

    const mesh = this.devices.filter(d => d.type === 'MESH');
    const wifis = this.devices.filter(d => d.type === 'WIFI');
    const eths = this.devices.filter(d => d.type === 'ETHERNET');
    const bts = this.devices.filter(d => d.type === 'BLUETOOTH');

    if (mesh.length > 0) {
      core.innerHTML = mesh.map(d => this.renderNode(d, 'primary')).join('');
    } else if (!this.isScanning) {
      core.innerHTML = '<div class="col-span-2 p-16 text-center t-panel glass-panel border-dashed opacity-20 mono-xs text-slate-500 uppercase italic tracking-[0.4em]">No_Mesh_Peers_Discovered</div>';
    }
    
    wifi.innerHTML = wifis.length ? wifis.map(d => this.renderSignal(d, d.state === 'OPEN' ? 'danger' : 'primary')).join('') 
                     : '<div class="p-8 bg-black/40 border border-white/5 rounded-lg mono-xs text-slate-800 italic uppercase font-black text-center tracking-widest opacity-30">No_Active_Signals</div>';
    
    eth.innerHTML = eths.length ? eths.map(d => this.renderSignal(d, 'primary')).join('')
                     : '<div class="p-8 bg-black/40 border border-white/5 rounded-lg mono-xs text-slate-800 italic uppercase font-black text-center tracking-widest opacity-30">Bus_Clear</div>';
    
    bt.innerHTML = bts.length ? bts.map(d => this.renderSignal(d, 'primary')).join('')
                     : '<div class="p-8 bg-black/40 border border-white/5 rounded-lg mono-xs text-slate-800 italic uppercase font-black text-center tracking-widest opacity-30">No_Devices</div>';
  }

  renderNode(d, theme) {
    const color = `var(--${theme})`;
    return `
      <div class="t-panel glass-panel border-l-4 group transition-all hover:bg-white/[0.02] hover:translate-x-1 p-8" style="border-left-color: ${color}">
        <div class="flex justify-between items-start mb-8">
          <div class="flex items-center gap-5">
            <span class="dot active shadow-primary" style="background: ${color}"></span>
            <div class="flex flex-col gap-1">
               <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Sovereign_Peer</span>
               <span class="text-xl font-black text-white uppercase tracking-tighter italic select-all">${d.hostname || d.ip || 'UNKNOWN'}</span>
            </div>
          </div>
          <span class="mono-xs text-primary font-black tabular-nums tracking-widest select-all bg-primary/5 px-3 py-1 rounded border border-primary/20">${d.mac || '??:??:??:??'}</span>
        </div>
        <div class="flex justify-between items-center pt-6 border-t border-white/5">
          <div class="flex items-center gap-2">
             <span class="mono-xs text-slate-700 font-black uppercase">Vendor:</span>
             <span class="mono-xs text-slate-400 font-black uppercase tracking-widest">${d.vendor || 'UNIDENTIFIED'}</span>
          </div>
          <div class="status-pill active py-1 px-4 shadow-primary" style="background: var(--${theme}-glow); color: ${color}; border-color: var(--${theme}-glow); font-size: 9px;">${d.state || 'REACHABLE'}</div>
        </div>
      </div>
    `;
  }

  renderSignal(d, theme) {
    const isDanger = theme === 'danger';
    const color = isDanger ? 'var(--danger)' : 'var(--primary)';
    const signal = d.signal || 0;
    
    return `
      <div class="flex flex-col gap-4 p-5 bg-black/60 border border-white/5 rounded-lg group hover:bg-black/80 hover:border-white/20 transition-all shadow-inner">
        <div class="flex justify-between items-center">
          <div class="flex flex-col gap-1">
             <span class="mono-xs text-slate-700 font-black uppercase tracking-tight" style="font-size: 8px;">Network_Identifier</span>
             <span class="mono-xs font-black uppercase truncate max-w-[160px] ${isDanger ? 'text-danger shadow-danger' : 'text-slate-400 group-hover:text-white'} transition-colors tracking-widest">
               ${d.ssid || d.hostname || d.ip || d.mac || 'HIDDEN_VECTOR'}
             </span>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex gap-1 items-end h-4">
              ${[1,2,3,4].map(i => `
                <div class="w-1 rounded-full transition-all duration-500" style="height: ${i * 25}%; background: ${signal >= i * 25 ? color : 'var(--border-subtle)'}; opacity: ${signal >= i * 25 ? 1 : 0.1}; box-shadow: ${signal >= i * 25 ? `0 0 8px ${color}66` : 'none'}"></div>
              `).join('')}
            </div>
            <div class="dot ${d.state === 'OPEN' ? 'danger pulse shadow-danger' : ''}" style="width:5px; height:5px; background: ${d.state === 'OPEN' ? 'var(--danger)' : 'transparent'}"></div>
          </div>
        </div>
        <div class="flex justify-between items-center pt-3 border-t border-white/5">
           <div class="status-pill ${isDanger ? 'danger' : 'active'} py-0.5 px-2 opacity-50 group-hover:opacity-100 transition-all" style="font-size: 8px; ${!isDanger ? 'background:var(--primary-glow); border-color:var(--primary-glow); color:var(--primary)' : ''}">
             ${d.encryption || d.state || 'SECURE'}
           </div>
           <span class="mono-xs text-slate-800 font-black group-hover:text-slate-600 transition-colors uppercase select-all" style="font-size: 9px;">H_IDX: ${(d.mac || '').slice(-8)}</span>
        </div>
      </div>
    `;
  }
}

customElements.define('network-map', NetworkMap);
