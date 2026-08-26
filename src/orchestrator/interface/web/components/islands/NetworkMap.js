/**
 * NetworkMap Island
 * Authoritative Tactical Topology Visualization.
 */
import { unwrap } from "./api.js";
class NetworkMap extends HTMLElement {
  constructor() {
    super();
    this.devices = [];
    this.isScanning = true;
    this.isBaseRendered = false;
  }

  static get observedAttributes() {
    return ['mode'];
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'mode' && oldVal !== newVal) {
      this.isBaseRendered = false;
      this.renderBase();
      this.render();
    }
  }

  get mode() {
    return this.getAttribute('mode') || 'FULL';
  }

  connectedCallback() {
    this.renderBase();
    this.fetchTopology();
    this._interval = setInterval(() => this.fetchTopology(), 10000);
  }

  disconnectedCallback() {
    clearInterval(this._interval);
  }

  async fetchTopology() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/network/discovery', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await unwrap(res);
        let allDevices = [];
        if (Array.isArray(data)) {
            allDevices = data;
        } else if (typeof data === 'object') {
            allDevices = [
              ...(data.wifi || []),
              ...(data.bluetooth || []),
              ...(data.ethernet || []),
              ...(data.mesh || [])
            ];
        }

        // Authoritative Deduplication: Prioritize MESH > ETHERNET > WIFI/BT
        const unique = new Map();
        allDevices.forEach(d => {
            const mac = d.mac?.toLowerCase();
            if (!mac) return;
            const existing = unique.get(mac);
            if (!existing || (d.type === 'MESH' && existing.type !== 'MESH')) {
                unique.set(mac, d);
            }
        });
        this.devices = Array.from(unique.values());
      }
    } catch (e) {
      console.error("[NETWORK-MAP] Sync Error:", e);
    } finally {
      this.isScanning = false;
      this.render();
      this.updateScanIndicator();
    }
  }

  updateScanIndicator() {
    const indicator = this.querySelector('#scan-indicator');
    if (indicator) {
        const meshCount = this.devices.filter(d => d.type === 'MESH').length;
        const total = this.devices.length;
        indicator.innerHTML = `
            <span class="dot active"></span>
            <span class="eyebrow" data-tone="primary">Grid_Telemetry_Live // [M:${meshCount}] [T:${total}]</span>
        `;
    }
  }

  renderBase() {
    this.innerHTML = `
      <div class="space-y-4">
        <div id="topology-map" class="space-y-4">
           <div class="flex justify-between items-center mb-5 pb-4 border-b border-white/5">
              <div class="flex items-center gap-4">
                 <div class="w-2 h-8 bg-primary rounded-full shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)]"></div>
                 <h3 class="tactical-title text-3xl tracking-[0.2em]">ACTIVE_INFRASTRUCTURE_TOPOLOGY</h3>
              </div>
              <div id="scan-indicator" class="flex items-center gap-4 bg-primary/5 px-4 py-3 rounded-full border border-primary/20">
                 <span class="dot active"></span>
                 <span class="eyebrow" data-tone="primary">Grid_Telemetry_Live</span>
              </div>
           </div>

           <!-- Central Router / Gateway Node -->
           <div id="gateway-root" class="flex justify-center mb-6"></div>

           <!-- Connected Assets Layer -->
           <div class="relative">
              <div class="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"></div>
              <div id="asset-layer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-6">
                 <div class="col-span-full flex items-center justify-center p-6 opacity-20">
                    <span class="eyebrow animate-pulse" data-tone="primary">Scanning_Bus...</span>
                 </div>
              </div>
           </div>
        </div>
        
        ${this.mode === 'NEIGHBORS' || this.mode === 'FULL' ? `
        <div id="environmental-signals" class="space-y-4 pt-5 border-t border-white/5">
           <h3 class="eyebrow mb-4">ENVIRONMENTAL_SPECTRUM_SIGNALS</h3>
           <div class="grid grid-cols-12 gap-4">
              <div class="col-span-12 lg:col-span-6 space-y-4">
                 <div id="wifi-nodes" class="grid grid-cols-1 gap-3"></div>
              </div>
              <div class="col-span-12 lg:col-span-6 space-y-4">
                 <div id="bt-nodes" class="grid grid-cols-1 gap-3"></div>
              </div>
           </div>
        </div>
        ` : ''}
      </div>
    `;
    this.isBaseRendered = true;
  }

  render() {

    // Discovery data: a neighbour on the wire chooses these strings.

    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    if (!this.isBaseRendered) return;

    const root = this.querySelector('#gateway-root');
    const assets = this.querySelector('#asset-layer');
    const wifi = this.querySelector('#wifi-nodes');
    const bt = this.querySelector('#bt-nodes');

    // 1. Identify Gateway / Central Node
    const gateway = this.devices.find(d => d.isLocal || d.hostname?.includes('GATEWAY') || d.hostname?.includes('(LOCAL)') || d.ip?.endsWith('.1'));
    const otherAssets = this.devices.filter(d => 
       (d.type === 'MESH' || d.type === 'ETHERNET') && 
       d.mac !== gateway?.mac
    );

    if (root) {
      if (gateway) {
        root.innerHTML = this.renderGatewayNode(gateway);
      } else {
        root.innerHTML = `<div class="eyebrow p-4 border border-dashed border-white/10 rounded-lg opacity-30 italic text-center w-full max-w-md">Default_Gateway_Undetected</div>`;
      }
    }

    if (assets) {
      if (otherAssets.length > 0) {
        assets.innerHTML = otherAssets.map(d => this.renderAssetNode(d)).join('');
      } else {
        assets.innerHTML = `<div class="eyebrow col-span-full p-6 text-center opacity-20">No_Connected_Assets_Found</div>`;
      }
    }

    if (wifi) {
      const wifis = this.devices.filter(d => d.type === 'WIFI');
      wifi.innerHTML = wifis.map(d => this.renderSignal(d)).join('');
    }
    
    if (bt) {
      const bts = this.devices.filter(d => d.type === 'BLUETOOTH');
      bt.innerHTML = bts.map(d => this.renderSignal(d)).join('');
    }
  }

  renderGatewayNode(d) {
    return `
      <div class="relative group">
         <div class="absolute -inset-4 bg-primary/10 rounded-lg blur-xl group-hover:bg-primary/20 transition-all"></div>
         <div class="relative t-panel glass-panel border-t-4 border-primary p-5 w-full max-w-md text-center">
            <div class="flex flex-col items-center gap-4">
               <div class="w-16 h-16 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6 3 3-3 3"/><path d="M18 9H3v7"/><path d="M15 13H3"/></svg>
               </div>
               <span class="eyebrow" data-tone="primary">CORE_GATEWAY</span>
               <h4 class="mono-lg font-black text-white italic select-all">${d.hostname || d.ip}</h4>
               <div class="flex gap-4 pt-4 mt-4 border-t border-white/5 w-full justify-center">
                  <span class="eyebrow">${esc(d.mac)}</span>
                  <span class="mono-xs text-primary font-black">${d.state || 'ACTIVE'}</span>
               </div>
            </div>
         </div>
      </div>
    `;
  }

  renderAssetNode(d) {
    const isMesh = d.type === 'MESH';
    const isStale = d.state === 'stale';
    const state = isMesh ? 'info' : 'warn';
    
    return `
      <div class="t-panel glass-panel border-l-4 tone-edge p-4 group hover:bg-white/[0.02] transition-all ${isStale ? 'is-stale' : ''}" data-state="${state}">
        <div class="flex justify-between items-start mb-4">
          <div class="flex items-center gap-4">
            <span class="indicator" data-state="${isStale ? 'idle' : state}"></span>
            <div class="flex flex-col">
               <span class="eyebrow" class="eyebrow">${isMesh ? 'SOVEREIGN_NODE' : 'ETHERNET_ASSET'}</span>
               <span class="mono-md font-black text-white italic truncate max-w-[150px]">${d.hostname || d.ip}</span>
            </div>
          </div>
          <div class="status-pill ${isMesh ? 'active primary' : 'bg-warning/10 border-warning/20'}">${esc(d.ip)}</div>
        </div>
        <div class="pt-4 border-t border-white/5 flex justify-between items-center">
          <span class="eyebrow">${esc(d.mac)}</span>
          <span class="eyebrow tone-text" data-state="${state}">${d.state || 'CONNECTED'}</span>
        </div>
      </div>
    `;
  }

  renderSignal(d) {
    return `
      <div class="p-4 bg-black/40 border border-white/5 rounded flex justify-between items-center group hover:border-white/20 transition-colors">
        <div class="flex items-center gap-4">
           <div class="w-1 h-4 bg-slate-800 rounded"></div>
           <span class="eyebrow truncate max-w-[120px]">${d.ssid || d.hostname || d.mac}</span>
        </div>
        <div class="flex items-center gap-4">
           <span class="eyebrow">${esc(d.type)}</span>
           <div class="w-10 h-1 bg-white/5 rounded-full overflow-hidden">
              <div class="h-full bg-primary" data-value="${Number(d.signal) || 0}"></div>
           </div>
        </div>
      </div>
    `;
  }
}

customElements.define('network-map', NetworkMap);
