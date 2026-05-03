/**
 * Custom Element: PcapAgent
 * High-fidelity deep packet inspection and network capture controller.
 */
class PcapAgent extends HTMLElement {
  constructor() {
    super();
    this.packets = [];
    this.isCapturing = false;
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
        if (payload.type === 'NETWORK_LOG' || payload.type === 'PACKET') {
          this.addPacket(payload.data || payload);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connectWS(), 5000);
  }

  addPacket(packet) {
    this.packets.unshift(packet);
    if (this.packets.length > 100) this.packets.pop();
    this.render();
  }

  async startCapture() {
    if (this.isCapturing) return;
    this.isCapturing = true;

    const iface = document.getElementById('pcap-iface')?.value || 'any';
    const filter = document.getElementById('pcap-filter')?.value || '';
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
    
    const btn = document.getElementById('btn-start-pcap');
    const originalText = btn?.innerHTML;
    if (btn) btn.innerHTML = '<span class="animate-pulse">INITIATING_SEQUENCE...</span>';

    try {
      const res = await fetch('/api/agents/pcap/command', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CT-Token': csrf || ''
        },
        body: JSON.stringify({
          type: 'StartCapture',
          payload: { interface: iface, duration: 300, filename: `capture_\${Date.now()}.pcap`, filter }
        })
      });
      const data = await res.json();
      
      // Visual feedback in logs
      this.addPacket({
        timestamp: Date.now(),
        direction: 'SYSTEM',
        source: 'CONTROL_PLANE',
        destination: 'PCAP_EXECUTOR',
        protocol: 'COMMAND',
        action: 'INIT',
        message: data.message || 'Capture sequence initiated'
      });
    } catch (e) {
       console.error('[PCAP_AGENT] Capture failed:', e);
    } finally {
      if (btn) btn.innerHTML = originalText;
      this.isCapturing = false;
    }
  }

  render() {
    const container = document.getElementById('pcap-stream');
    if (!container) return;

    if (this.packets.length === 0) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-24 opacity-20">
           <div class="w-12 h-12 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mb-6"></div>
           <div class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em] animate-pulse">Awaiting_Packet_Intercepts...</div>
        </div>
      `;
      return;
    }

    container.innerHTML = this.packets.map(p => {
      const isSystem = p.direction === 'SYSTEM';
      const color = isSystem ? 'var(--primary)' : (p.direction === 'INBOUND' ? 'var(--primary)' : 'var(--warning)');
      
      return `
        <div class="flex items-center gap-8 p-5 border-b border-white/[0.03] hover:bg-white/[0.02] transition-all group animate-fade-in">
          <div class="flex items-center gap-4 w-24">
             <span class="mono-xs font-black uppercase tracking-widest" style="color: \${color}">\${(p.direction || 'IN').slice(0, 3)}</span>
             <span class="dot \${isSystem ? 'active shadow-primary' : (p.direction === 'INBOUND' ? 'active shadow-primary' : 'warning shadow-warning')}" style="width: 4px; height: 4px;"></span>
          </div>
          
          <div class="flex-1 min-w-0">
             <div class="mono-xs font-bold uppercase tracking-tight text-slate-400 truncate">
               \${window.escapeHTML(p.source || '...')} <span class="text-slate-800 px-2">→</span> \${window.escapeHTML(p.destination || '...')}
             </div>
             \${p.message ? `<div class="mono-xs text-[9px] text-slate-600 mt-1 uppercase font-black tracking-widest animate-pulse">\${window.escapeHTML(p.message)}</div>` : ''}
          </div>

          <div class="flex items-center gap-6">
             <span class="mono-xs font-black uppercase tracking-[0.2em] text-slate-700 bg-black/40 px-3 py-1 rounded border border-white/5">
                \${window.escapeHTML(p.protocol || 'TCP')}
             </span>
             <span class="mono-xs text-slate-600 font-bold">\${new Date(p.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}

customElements.define('pcap-agent', PcapAgent);
