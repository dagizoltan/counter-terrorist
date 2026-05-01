class ThreatIntelList extends HTMLElement {
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
        if (payload.type === 'METRICS_UPDATE' && payload.data?.tactical) {
          this.updateThreats(payload.data.tactical.recentThreats);
        }
      } catch (e) {}
    };
  }

  render() {
    this.innerHTML = `
      <div class="space-y-4">
        <div id="threat-container" class="space-y-2">
           <div class="p-6 text-center text-slate-600 text-[10px] font-black uppercase tracking-widest">Awaiting_Intelligence_Stream...</div>
        </div>
      </div>
    `;
  }

  updateThreats(threats) {
    const container = this.querySelector('#threat-container');
    if (!container || !threats.length) return;

    container.innerHTML = threats.map(t => `
      <div class="p-4 bg-white/5 border border-white/5 rounded hover:bg-white/[0.07] transition-all group flex items-center justify-between">
         <div class="flex items-center gap-4">
            <div class="w-1.5 h-1.5 ${t.blocked ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-danger shadow-[0_0_8px_rgba(239,68,68,0.5)]'}"></div>
            <div class="flex flex-col">
               <span class="text-[11px] font-mono ${t.blocked ? 'text-emerald-400' : 'text-white'}">${t.indicator}</span>
               <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">${t.threatType}</span>
            </div>
         </div>
         <div class="flex items-center gap-6">
            <div class="flex flex-col items-end">
               <span class="text-[8px] font-black text-slate-500 uppercase tracking-widest">Source</span>
               <span class="text-[9px] font-bold text-white uppercase">${t.provider}</span>
            </div>
            <div class="w-24 px-2 py-1 ${t.blocked ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-danger/10 border-danger/20 text-danger'} border text-[8px] font-black text-center uppercase rounded">
               ${t.blocked ? 'ENFORCED' : 'PENDING'}
            </div>
         </div>
      </div>
    `).join('');
  }
}

customElements.define('threat-intel-list', ThreatIntelList);
