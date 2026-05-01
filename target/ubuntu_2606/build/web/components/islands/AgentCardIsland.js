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
        if (payload.type === 'METRICS_UPDATE' && payload.data) {
          this.updateMetrics(payload.data);
        }
        if (payload.type === 'THREAT' || payload.type === 'CRITICAL' || payload.type === 'INFO') {
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
    // Only capture events relevant to this agent (if possible)
    const msg = event.message.toLowerCase();
    if (msg.includes(this.agentName) || (this.agentName === 'firewall' && msg.includes('block'))) {
       const feed = this.querySelector('.agent-feed');
       if (feed) {
          const entry = document.createElement('div');
          entry.className = 'text-[7px] font-mono text-slate-500 mb-1 border-l border-white/10 pl-2 opacity-0 animate-in fade-in slide-in-from-left-2 duration-300';
          entry.textContent = `[${new Date().toLocaleTimeString()}] ${event.message.substring(0, 40)}...`;
          feed.prepend(entry);
          if (feed.children.length > 3) feed.lastChild.remove();
       }
    }
  }

  updateMetrics(m) {
    let value = '—';
    let label = 'TELEMETRY';
    let color = '#94a3b8';
    let percentage = 0;

    if (this.agentName === 'firewall') {
      value = m.firewall?.blockedCount ?? '0';
      label = 'BLOCKED_IPS';
      color = value > 0 ? '#ef4444' : '#22c55e';
      percentage = Math.min((value / 100) * 100, 100);
    } else if (this.agentName === 'honeypot') {
      value = m.honeypot?.totalHits ?? '0';
      label = 'ATTACK_HITS';
      color = value > 0 ? '#f97316' : '#22c55e';
      percentage = Math.min((value / 50) * 100, 100);
    } else if (this.agentName === 'scanner') {
      value = m.scanner?.lastScanResult === 'OK' ? 'OK' : 'WAIT';
      label = 'SCAN_STATE';
      color = value === 'OK' ? '#22c55e' : '#eab308';
      percentage = value === 'OK' ? 100 : 50;
    } else if (this.agentName === 'ebpf') {
      value = m.forensics?.ebpfActive ? 'LIVE' : 'FAIL';
      label = 'KERNEL_LSM';
      color = value === 'LIVE' ? '#22c55e' : '#ef4444';
      percentage = value === 'LIVE' ? 100 : 0;
    } else if (this.agentName === 'fim') {
      value = m.forensics?.fimActive ? 'WATCH' : 'STOP';
      label = 'FILE_INTEGRITY';
      color = value === 'WATCH' ? '#22c55e' : '#ef4444';
      percentage = value === 'WATCH' ? 100 : 0;
    }

    // Update UI elements
    const valEl = this.querySelector('.agent-value');
    const labEl = this.querySelector('.agent-label');
    const ringEl = this.querySelector('.agent-ring');
    
    if (valEl) {
      valEl.textContent = value;
      valEl.style.color = color;
    }
    if (labEl) labEl.textContent = label;
    if (ringEl) {
       const dashArray = 2 * Math.PI * 18; // radius 18
       const offset = dashArray - (percentage / 100) * dashArray;
       ringEl.style.strokeDashoffset = offset;
       ringEl.style.stroke = color;
    }
  }

  render() {
    this.innerHTML = `
      <div class="flex gap-6 items-center">
         <div class="relative w-16 h-16 flex items-center justify-center">
            <svg class="w-full h-full -rotate-90">
               <circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="4" />
               <circle class="agent-ring" cx="32" cy="32" r="18" fill="none" stroke="#22c55e" stroke-width="4" 
                  stroke-dasharray="113.1" stroke-dashoffset="113.1" stroke-linecap="round" 
                  style="transition: stroke-dashoffset 1s ease, stroke 1s ease;" />
            </svg>
            <div class="absolute inset-0 flex items-center justify-center">
               <span class="agent-value text-sm font-black tracking-tighter">0</span>
            </div>
         </div>
         
         <div class="flex-1 min-w-0">
            <div class="agent-label text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">Initializing...</div>
            <div class="agent-feed space-y-1">
               <div class="text-[7px] font-mono text-slate-600 italic">Waiting for telemetry...</div>
            </div>
         </div>
      </div>
    `;
  }
}
customElements.define('agent-card-island', AgentCardIsland);
