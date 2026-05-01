class PcapAgent extends HTMLElement {
  constructor() {
    super();
    this.packets = [];
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
        // PCAP events from main.ts are broadcasted when sidecar emits 'PACKET'
        if (payload.type === 'NETWORK_LOG' || payload.type === 'PACKET') {
          this.addPacket(payload.data || payload);
        }
      } catch (e) {
        console.error('[PCAP-AGENT] WS parse error', e);
      }
    };

    ws.onclose = () => {
      setTimeout(() => this.connectWS(), 5000);
    };
  }

  addPacket(packet) {
    this.packets.unshift(packet);
    if (this.packets.length > 50) this.packets.pop();
    this.render();
  }

  async startCapture() {
    const iface = document.getElementById('pcap-iface')?.value || 'any';
    const filter = document.getElementById('pcap-filter')?.value || '';
    
    try {
      const res = await fetch('/api/agents/pcap/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'StartCapture',
          payload: { interface: iface, duration: 300, filename: `capture_${Date.now()}.pcap`, filter }
        })
      });
      const data = await res.json();
      alert(data.message || 'Capture started');
    } catch (e) {
      alert('Failed to start capture: ' + e.message);
    }
  }

  render() {
    const container = document.getElementById('pcap-stream');
    if (!container) return;

    if (this.packets.length === 0) {
      container.innerHTML = '<p class="text-slate-600 italic text-[10px] uppercase text-center py-8">Awaiting packet inspection...</p>';
      return;
    }

    container.innerHTML = this.packets.map(p => `
      <div class="grid grid-cols-6 gap-2 p-2 border-b border-white/5 font-mono text-[9px] hover:bg-white/5 transition-all">
        <span class="${p.direction === 'INBOUND' ? 'text-cyber' : 'text-purple-400'} font-black">${p.direction || 'IN'}</span>
        <span class="text-slate-300 truncate col-span-2">${p.source || '...'}</span>
        <span class="text-slate-500">→</span>
        <span class="text-slate-300 truncate">${p.destination || '...'}</span>
        <span class="text-right ${p.action === 'BLOCK' ? 'text-red-500' : 'text-emerald-500'}">${p.protocol || 'TCP'}</span>
      </div>
    `).join('');
  }
}
customElements.define('pcap-agent', PcapAgent);
