class FimAgent extends HTMLElement {
  constructor() {
    super();
    this.alerts = [];
  }

  connectedCallback() {
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'FIM_ALERT' || (payload.data?.type === 'FileAlert')) {
          this.addAlert(payload.data || payload);
        }
      } catch (e) {
        console.error('[FIM-AGENT] WS parse error', e);
      }
    };

    ws.onclose = () => {
      setTimeout(() => this.connectWS(), 5000);
    };
  }

  addAlert(alert) {
    this.alerts.unshift(alert);
    if (this.alerts.length > 50) this.alerts.pop();
    this.render();
  }

  render() {
    const container = document.getElementById('fim-alerts');
    if (!container) return;

    if (this.alerts.length === 0) {
      container.innerHTML = '<p class="text-slate-600 italic text-[10px] uppercase">Awaiting file integrity signals...</p>';
      return;
    }

    container.innerHTML = this.alerts.map(alert => `
      <div class="flex items-center gap-3 p-3 border-b border-white/5 hover:bg-white/5 transition-all">
        <div class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
        <div class="flex-1">
          <div class="flex justify-between mb-1">
            <span class="text-[9px] font-black text-white uppercase tracking-widest">${alert.action || 'MODIFY'}</span>
            <span class="text-[8px] font-mono text-slate-500">${new Date().toLocaleTimeString()}</span>
          </div>
          <p class="text-[10px] font-mono text-slate-400 break-all">${alert.path}</p>
        </div>
      </div>
    `).join('');
  }
}
customElements.define('fim-agent', FimAgent);
