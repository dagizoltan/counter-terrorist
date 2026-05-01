class AgentDetail extends HTMLElement {
  constructor() {
    super();
    this.agentName = null;
  }

  connectedCallback() {
    this.agentName = this.getAttribute('data-agent');
    if (this.agentName) {
      this.fetchStatus(this.agentName);
      this.setupControls();
    }
  }

  async fetchStatus(name) {
    try {
      const res = await fetch('/api/agent/status');
      if (!res.ok) return;
      const data = await res.json();

      const agentData = data[name];
      if (!agentData) return;

      // Update health
      const healthEl = document.getElementById(`agent-health-${name}`);
      if (healthEl) {
        const isActive = agentData.active !== false;
        healthEl.textContent = isActive ? 'OPERATIONAL' : 'INACTIVE';
        healthEl.className = isActive ? 'text-green-500 font-black' : 'text-red-500 font-black';
      }

      // Update PID  
      const pidEl = document.getElementById(`agent-pid-${name}`);
      if (pidEl) {
        pidEl.textContent = agentData.pid ? `PID_${agentData.pid}` : 'N/A';
      }

      // Update capabilities
      const capsEl = document.getElementById(`agent-caps-${name}`);
      if (capsEl) {
        const caps = agentData.capabilities || ['STANDARD'];
        capsEl.innerHTML = caps.map(c => 
          `<span class="px-2 py-0.5 bg-white/10 text-[9px] font-black uppercase rounded border border-white/5">${c}</span>`
        ).join('');
      }

      // Update privilege
      const privEl = document.getElementById(`agent-priv-${name}`);
      if (privEl) {
        const isRoot = agentData.root === true;
        privEl.textContent = isRoot ? 'ROOT_ACCESS' : 'USER_LEVEL';
        privEl.className = isRoot ? 'text-yellow-500 font-bold' : 'text-green-500 font-bold';
      }

      this.renderMetrics(name, agentData);
    } catch (e) {
      console.error('Failed to load agent details:', e);
    }
  }

  setupControls() {
    const restartBtn = document.getElementById(`btn-restart-${this.agentName}`);
    const stopBtn = document.getElementById(`btn-stop-${this.agentName}`);
    
    if (restartBtn) {
      restartBtn.onclick = () => this.handleAction('restart');
    }
    if (stopBtn) {
      stopBtn.onclick = () => this.handleAction('stop');
    }
  }

  async handleAction(action) {
    if (!confirm(`Are you sure you want to ${action} the ${this.agentName} agent?`)) return;
    
    try {
      const res = await fetch(`/api/agents/${this.agentName}/${action}`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        alert(`${this.agentName} ${action} successful.`);
        this.fetchStatus(this.agentName);
      } else {
        alert(`Failed to ${action} agent: ${result.error}`);
      }
    } catch (e) {
      alert(`Error during ${action}: ${e.message}`);
    }
  }

  renderMetrics(name, agentData) {
    const container = document.getElementById('agent-metrics-container');
    if (!container) return;

    if (name === 'firewall') {
      const metrics = agentData.metrics || {};
      container.innerHTML = `
        <div class="space-y-8">
          <div>
            <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 italic opacity-50">Blocked_Perimeter_IPs</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
               ${metrics.blockedIps?.map(ip => `
                 <div class="p-3 bg-danger/5 border border-danger/20 rounded text-[10px] font-mono text-danger flex items-center justify-between group hover:bg-danger/10 transition-all">
                     <span>${ip}</span>
                     <button onclick="fetch('/api/agents/firewall/unblock', {method:'POST', body:JSON.stringify({ip: '${ip}'})}).then(() => location.reload())" class="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] font-black uppercase underline">UNBLOCK</button>
                 </div>
               `).join('') || '<div class="col-span-full text-[9px] text-slate-600 italic">No IPs currently blocked.</div>'}
            </div>
          </div>
          <div>
            <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 italic opacity-50">Deep_Packet_Inspection_Feed</p>
            <div id="traffic-log-container" class="space-y-1 max-h-[300px] overflow-y-auto font-mono text-[9px]">
               <p class="text-slate-600 italic">Synchronizing stream...</p>
            </div>
          </div>
        </div>
      `;
      this.fetchTraffic();
    } else if (name === 'vpn') {
      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="p-6 bg-black/40 border border-white/5 rounded-xl">
             <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-4">Tunnel_Config</span>
             <div class="space-y-3">
                <div class="flex justify-between">
                   <span class="text-[10px] text-slate-400">INTERFACE</span>
                   <span class="text-[10px] font-mono text-cyber">wg0</span>
                </div>
                <div class="flex justify-between">
                   <span class="text-[10px] text-slate-400">ENCRYPTION</span>
                   <span class="text-[10px] text-white">ChaCha20-Poly1305</span>
                </div>
             </div>
          </div>
          <div class="p-6 bg-black/40 border border-white/5 rounded-xl">
             <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-4">Traffic_Telemetry</span>
             <div class="space-y-3">
                <div class="flex justify-between">
                   <span class="text-[10px] text-slate-400">DATA_SENT</span>
                   <span class="text-[10px] text-white font-mono">0.00 MB</span>
                </div>
                <div class="flex justify-between">
                   <span class="text-[10px] text-slate-400">DATA_RECV</span>
                   <span class="text-[10px] text-white font-mono">0.00 MB</span>
                </div>
             </div>
          </div>
        </div>
        <div class="mt-8">
           <button id="btn-vpn-connect" class="px-6 py-2 bg-cyber/10 border border-cyber/20 text-cyber text-[10px] font-black uppercase rounded hover:bg-cyber/20 transition-all mr-4">Connect_Tunnel</button>
           <button id="btn-vpn-disconnect" class="px-6 py-2 bg-danger/10 border border-danger/20 text-danger text-[10px] font-black uppercase rounded hover:bg-danger/20 transition-all">Disconnect_Tunnel</button>
        </div>
      `;
      document.getElementById('btn-vpn-connect').onclick = () => fetch('/api/agents/vpn/connect', {method:'POST', body: JSON.stringify({})}).then(r => r.json()).then(d => alert(d.message || d.success));
      document.getElementById('btn-vpn-disconnect').onclick = () => fetch('/api/agents/vpn/disconnect', {method:'POST'}).then(r => r.json()).then(d => alert(d.message || d.success));
    } else if (name === 'ebpf') {
      container.innerHTML = `
        <div class="space-y-6">
           <div class="flex items-center gap-3">
              <div id="ebpf-status-dot" class="w-2 h-2 bg-slate-500 rounded-full"></div>
              <span id="ebpf-status-label" class="text-[10px] font-black text-white uppercase tracking-widest">Initializing_Guardian...</span>
           </div>
           <div class="p-6 bg-black/40 border border-white/5 rounded-xl">
              <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-4">Kernel_Signals</span>
              <div id="ebpf-event-log" class="space-y-1 max-h-[300px] overflow-y-auto font-mono text-[9px]">
                 <p class="text-slate-600 italic">Listening for kernel hooks...</p>
              </div>
           </div>
        </div>
      `;
      // eBPF island will handle the rest if it's in the page
    }
  }

  async fetchTraffic() {
    try {
      const res = await fetch('/api/network/logs');
      const logs = await res.json();
      const logEl = document.getElementById('traffic-log-container');
      if (!logEl) return;
      if (!logs || logs.length === 0) {
        logEl.innerHTML = '<p class="text-slate-600 italic">No traffic recorded yet.</p>';
        return;
      }
      logEl.innerHTML = logs.map(l => `
        <div class="flex items-center gap-4 p-2 border-b border-white/5 hover:bg-white/5">
          <span class="text-slate-500 w-16">${new Date(l.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
          <span class="w-12 font-black ${l.direction === 'INBOUND' ? 'text-blue-500' : 'text-purple-500'}">${l.direction.slice(0, 3)}</span>
          <span class="flex-1 truncate">${l.source} -> ${l.destination}</span>
          <span class="w-12 text-right ${l.action === 'BLOCK' ? 'text-red-500 font-bold' : 'text-green-500'}">${l.action}</span>
        </div>
      `).join('');
    } catch {}
  }
}
customElements.define('agent-detail', AgentDetail);
