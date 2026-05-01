class NetworkMap extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);
    const ws = new WebSocket(url.toString());

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'METRICS_UPDATE' && payload.data?.discovery) {
          this.updateDevices(payload.data.discovery.devices);
        }
      } catch (e) {}
    };
  }

  render() {
    this.innerHTML = `
      <div class="relative w-full h-[400px] bg-black/20 rounded-xl border border-white/5 overflow-hidden p-8">
        <div id="device-grid" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
           <!-- Devices will be injected here -->
           <div class="flex flex-col items-center justify-center p-4 border border-dashed border-white/10 rounded-lg opacity-40">
              <span class="text-[9px] font-black text-slate-600 uppercase">Scanning...</span>
           </div>
        </div>

        <div class="absolute bottom-4 left-8 flex gap-6">
           <div class="flex items-center gap-2">
              <div class="w-2 h-2 bg-cyber rounded-full"></div>
              <span class="text-[8px] font-black text-slate-500 uppercase">Sovereign_Mesh</span>
           </div>
           <div class="flex items-center gap-2">
              <div class="w-2 h-2 bg-amber-500 rounded-full"></div>
              <span class="text-[8px] font-black text-slate-500 uppercase">Unknown_Device</span>
           </div>
        </div>
      </div>
    `;
  }

  updateDevices(devices) {
    const grid = this.querySelector('#device-grid');
    if (!grid) return;

    grid.innerHTML = devices.map(dev => `
      <div class="group relative flex flex-col items-center p-4 rounded-xl border transition-all ${dev.isMeshNode ? 'border-cyber/20 bg-cyber/5 shadow-[0_0_20px_rgba(0,210,255,0.05)]' : 'border-white/5 bg-white/5'}">
         <div class="w-12 h-12 flex items-center justify-center mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${dev.isMeshNode ? 'text-cyber' : 'text-amber-500/60'}">
               <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
               <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
               <line x1="6" y1="6" x2="6" y2="6"/>
               <line x1="6" y1="18" x2="6" y2="18"/>
            </svg>
         </div>
         <span class="text-[10px] font-black text-white mb-1">${dev.hostname || 'Device'}</span>
         <span class="text-[8px] font-mono text-slate-500 mb-2">${dev.ip}</span>
         
         <div class="flex flex-wrap gap-1 justify-center">
           ${dev.role === 'GATEWAY' ? `
             <div class="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-500 text-[7px] font-black uppercase">GATEWAY</div>
           ` : ''}
           ${dev.isMeshNode ? `
             <div class="px-2 py-0.5 rounded bg-cyber/20 border border-cyber/40 text-cyber text-[7px] font-black uppercase">MESH_NODE</div>
           ` : ''}
           ${!dev.isMeshNode && dev.role !== 'GATEWAY' ? `
             <div class="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/40 text-[7px] font-black uppercase">PEER</div>
           ` : ''}
         </div>

         {/* Hover Tooltip */}
         <div class="absolute -top-2 left-1/2 -translate-x-1/2 bg-black/90 border border-white/10 p-3 rounded shadow-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 w-40">
            <div class="text-[8px] font-black text-slate-500 uppercase mb-1">Vendor</div>
            <div class="text-[9px] font-bold text-white mb-2">${dev.vendor}</div>
            <div class="text-[8px] font-black text-slate-500 uppercase mb-1">MAC_Address</div>
            <div class="text-[9px] font-mono text-white">${dev.mac}</div>
         </div>
      </div>
    `).join('');
  }
}

customElements.define('network-map', NetworkMap);
