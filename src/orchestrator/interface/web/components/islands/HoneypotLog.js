class HoneypotLog extends HTMLElement {
  constructor() {
    super();
    this.logs = [];
    this.moduleId = this.getAttribute('module-id');
  }

  connectedCallback() {
    this.render();
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new SharedWebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // [LOG] prefix is used by sidecars
        if (payload.type === 'AUDIT_EVENT' && payload.data?.caller?.includes('decoy')) {
            const log = payload.data;
            if (!this.moduleId || log.message.includes(this.moduleId) || log.payload?.module === this.moduleId) {
                this.addLog(log);
            }
        }
      } catch (e) {}
    };
  }

  addLog(log) {
    this.logs.unshift(log);
    if (this.logs.length > 50) this.logs.pop();
    this.render();
  }

  render() {
    if (this.logs.length === 0) {
      this.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 opacity-20">
           <span class="mono text-[8px] font-black uppercase tracking-[0.4em]">Awaiting_Decoy_Interaction...</span>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="space-y-3 font-mono text-[10px]">
        ${this.logs.map(log => {
          const time = new Date(log.timestamp).toLocaleTimeString([], { hour12: false });
          let color = 'text-slate-500';
          if (log.severity === 'ERROR') color = 'text-red-500';
          if (log.severity === 'WARNING') color = 'text-yellow-500';
          if (log.severity === 'SUCCESS') color = 'text-green-500';

          return `
            <div class="flex gap-4 border-l-2 border-white/5 pl-4 hover:border-primary/40 transition-colors">
               <span class="text-white font-bold opacity-40">[${time}]</span>
               <span class="${color} uppercase font-black tracking-widest text-[8px]">${log.type || 'EVENT'}</span>
               <span class="text-slate-300">${log.message}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }
}

customElements.define('honeypot-log', HoneypotLog);
