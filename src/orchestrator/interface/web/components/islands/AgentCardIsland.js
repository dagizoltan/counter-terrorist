class AgentCardIsland extends HTMLElement {
  constructor() {
    super();
    this.agentName = this.getAttribute('agent');
    this.history = [];
    this.maxHistory = 20;
  }

  connectedCallback() {
    this.render();
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if ((payload.type === 'METRICS_UPDATE' || (payload.type === 'DEBUG' && payload.subType === 'METRICS_UPDATE')) && payload.data) {
          this.updateMetrics(payload.data);
        }
        if (['THREAT', 'CRITICAL', 'INFO', 'HONEYPOT', 'DRIFT_PROCESS', 'EBPF_STRAY_SHELL', 'EBPF_CRITICAL', 'BLOCK'].includes(payload.type)) {
           this.handleEvent(payload);
        }
      } catch (e) {
        console.error('[AGENT-CARD-ISLAND] WS parse error', e);
      }
    };

    ws.onclose = () => {
      setTimeout(() => this.connectWS(), 5000);
    };
  }

  handleEvent(event) {
    if (!event.message) return;
    const msg = event.message.toLowerCase();
    if (msg.includes(this.agentName) || (this.agentName === 'firewall' && msg.includes('block'))) {
       const feed = this.querySelector('.agent-feed');
       if (feed) {
          const entry = document.createElement('div');
          entry.className = 'text-[7px] font-mono text-slate-500 mb-1 border-l border-white/10 pl-2 opacity-0 fade-in slide-in-from-left-2';
          entry.textContent = `[${new Date().toLocaleTimeString()}] ${event.message.substring(0, 40)}...`;
          feed.prepend(entry);
          if (feed.children.length > 3) feed.lastChild.remove();
       }
    }
  }

  updateMetrics(m) {
    let value = '—';
    let label = 'TELEMETRY';
    let colorVar = 'var(--primary)';
    let percentage = 0;

    if (this.agentName === 'firewall') {
      value = m.firewall?.blockedCount ?? '0';
      label = 'Blocked IPs';
      colorVar = value > 0 ? 'var(--danger)' : 'var(--success)';
      percentage = Math.min((value / 100) * 100, 100);
    } else if (this.agentName === 'honeypot') {
      value = m.honeypot?.totalHits ?? '0';
      label = 'Attack Hits';
      colorVar = value > 0 ? 'var(--warning)' : 'var(--success)';
      percentage = Math.min((value / 50) * 100, 100);
    } else if (this.agentName === 'scanner') {
      const isAvailable = m.scanner?.available !== false;
      value = isAvailable ? (m.scanner?.lastScanResult === 'OK' ? 'OK' : 'WAIT') : 'ABSENT';
      label = 'Malware Scan';
      colorVar = !isAvailable ? 'var(--text-muted)' : (value === 'OK' ? 'var(--success)' : 'var(--warning)');
      percentage = value === 'OK' ? 100 : (isAvailable ? 50 : 0);
    } else if (this.agentName === 'ebpf') {
      value = m.node?.ebpf ? 'LIVE' : 'FAIL';
      label = 'Kernel LSM';
      colorVar = value === 'LIVE' ? 'var(--success)' : 'var(--danger)';
      percentage = value === 'LIVE' ? 100 : 0;
    } else if (this.agentName === 'fim') {
      value = m.node?.fim ? 'WATCH' : 'STOP';
      label = 'File Integrity';
      colorVar = value === 'WATCH' ? 'var(--success)' : 'var(--danger)';
      percentage = value === 'WATCH' ? 100 : 0;
    } else if (this.agentName === 'vpn') {
      const vpnActive = m.vpn?.telemetry?.status === 'ACTIVE';
      value = vpnActive ? 'LINK' : 'FAIL';
      label = 'Stealth Tunnel';
      colorVar = value === 'LINK' ? 'var(--success)' : 'var(--danger)';
      percentage = value === 'LINK' ? 100 : 0;
    } else if (this.agentName === 'mesh') {
      value = 'LIVE';
      label = 'Mesh Fabric';
      colorVar = 'var(--success)';
      percentage = 100;
    }

    // Update UI elements
    const valEl = this.querySelector('.agent-value');
    const labEl = this.querySelector('.agent-label');
    const ringEl = this.querySelector('.agent-ring');
    
    if (valEl) {
      valEl.textContent = value;
      valEl.style.color = colorVar;
    }
    if (labEl) labEl.textContent = label;
    if (ringEl) {
       const dashArray = 2 * Math.PI * 18; // radius 18
       const offset = dashArray - (percentage / 100) * dashArray;
       ringEl.style.strokeDashoffset = offset;
       ringEl.style.stroke = colorVar;
    }
  }

  render() {
    this.innerHTML = `
      <div class="flex gap-6 items-center">
         <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full -rotate-90">
               <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="4" />
               <circle class="agent-ring" cx="32" cy="32" r="18" fill="none" stroke="var(--success)" stroke-width="4" 
                  stroke-dasharray="113.1" stroke-dashoffset="113.1" stroke-linecap="round" 
                  style="transition: stroke-dashoffset 1s ease, stroke 1s ease;" />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
               <span class="agent-value text-sm font-black tracking-tighter" style="color:var(--success);">0</span>
            </div>
         </div>
         
         <div class="flex-1 min-w-0">
            <div class="agent-label text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Initializing...</div>
            <div class="agent-feed space-y-1">
               <div class="text-[7px] font-mono text-slate-600 italic">Waiting for telemetry...</div>
            </div>
         </div>
      </div>
    `;
  }
}
if (!customElements.get('agent-card-island')) {
  customElements.define('agent-card-island', AgentCardIsland);
}
