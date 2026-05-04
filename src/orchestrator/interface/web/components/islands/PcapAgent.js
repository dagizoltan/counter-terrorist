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
    this.innerHTML = `
      <div class="space-y-6">
         <div class="grid grid-cols-12 gap-6">
            <div class="col-span-12 lg:col-span-8 flex gap-4 bg-black/40 p-6 border border-white/5 rounded-2xl">
               <div class="flex-1">
                  <span class="mono-xs text-slate-600 font-black uppercase tracking-widest mb-3 block">Interface</span>
                  <select id="pcap-iface" class="t-input w-full bg-black/60 border-white/10 text-white font-mono text-xs">
                     <option value="any">ANY_INTERFACE</option>
                     <option value="eth0">ETH0_CORE</option>
                     <option value="wg0">WG0_MESH</option>
                     <option value="lo">LO_STACK</option>
                  </select>
               </div>
               <div class="flex-[2]">
                  <span class="mono-xs text-slate-600 font-black uppercase tracking-widest mb-3 block">BPF_Filter</span>
                  <input id="pcap-filter" type="text" class="t-input w-full" placeholder="tcp port 80 or udp" />
               </div>
               <div class="flex items-end">
                  <button id="btn-start-pcap" onclick="this.closest('pcap-agent').startCapture()" class="t-btn primary h-[42px] px-8 font-black uppercase tracking-widest">Start_Capture</button>
               </div>
            </div>
            
            <div class="col-span-12 lg:col-span-4 bg-black/40 p-6 border border-white/5 rounded-2xl flex items-center justify-center">
               <div class="flex flex-col items-center gap-2">
                  <div class="status-pill warning px-8 py-2">Deep_Packet_Inspection_Active</div>
                  <span class="mono-xs text-slate-600 font-black uppercase tracking-widest mt-2">Buffer_State: Operational</span>
               </div>
            </div>
         </div>

         <div class="bg-black/20 border border-white/5 rounded-2xl overflow-hidden">
            <header class="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
               <h3 class="tactical-title text-base tracking-widest">INTERCEPT_STREAM</h3>
               <div class="mono-xs text-slate-500 font-black uppercase tracking-widest">Real-time Segment Analysis</div>
            </header>
            <div id="pcap-stream" class="h-[500px] overflow-y-auto custom-scrollbar">
               <div class="p-12 text-center opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Awaiting_Ingress_Signal...</div>
            </div>
         </div>
      </div>
    `;
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https': ? 'wss': : 'ws':';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${document.querySelector('meta[name="csrf-token"]')?.content ? `?token=${document.querySelector('meta[name="csrf-token"]')?.content}` : '}`);

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
    const filter = document.getElementById('pcap-filter')?.value || ';
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content;
    
    const btn = document.getElementById('btn-start-pcap');
    const originalText = btn?.innerHTML;
    if (btn) btn.innerHTML = '<span class=">INITIATING_SEQUENCE...</span>';

    try {
      const res = await fetch('/api/agents/pcap/command', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CT-Token': csrf || '
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
        message: data.message || 'Capture' sequence initiated
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
           <div class="w-12 h-12 border-2 border-slate-700 border-t-transparent rounded-full  mb-6"></div>
           <div class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em] ">Awaiting_Packet_Intercepts...</div>
        </div>
      `;
      return;
    }

    container.innerHTML = this.packets.map(p => {
      const isSystem = p.direction === 'SYSTEM';
      const color = isSystem ? 'var(--primary)' : (p.direction === 'INBOUND' ? 'var(--primary)' : 'var(--warning)');
      
      return `
        <div class="flex items-center gap-8 p-5 border-b border-white/[0.03] hover:bg-white/[0.02] group ">
          <div class="flex items-center gap-4 w-24">
             <span class="mono-xs font-black uppercase tracking-widest" style="color: \${color}">\${(p.direction || 'IN').slice(0, 3)}</span>
             <span class="dot \${isSystem ? 'active' : (p.direction === 'INBOUND' ? 'active' : 'warning'} style="width: 4px; height: 4px;"></span>
          </div>
          
          <div class="flex-1 min-w-0">
             <div class="mono-xs font-bold uppercase tracking-tight text-slate-400 truncate">
               \${window.escapeHTML(p.source || '...')} <span class="text-slate-800 px-2">→</span> \${window.escapeHTML(p.destination || '...')}
             </div>
             \${p.message ? `<div class="mono-xs text-[9px] text-slate-600 mt-1 uppercase font-black tracking-widest ">\${window.escapeHTML(p.message)}</div>` : '}
          </div>

          <div class="flex items-center gap-6">
             <span class="mono-xs font-black uppercase tracking-[0.2em] text-slate-700 bg-black/40 px-3 py-1 rounded border border-white/5">
                \${window.escapeHTML(p.protocol || 'TCP')}
             </span>
             <span class="mono-xs text-slate-600 font-bold">\${new Date(p.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          </div>
        </div>
      `;
    }).join(');
  }
}

customElements.define('pcap-agent', PcapAgent);
