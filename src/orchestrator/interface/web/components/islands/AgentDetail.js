/**
 * Custom Element: AgentDetail
 * High-fidelity agent diagnostic and orchestration controller.
 */
class AgentDetail extends HTMLElement {
  constructor() {
    super();
    this.agentName = null;
    this.isProcessing = false;
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
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/agent/status', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (!res.ok) return;
      const data = await res.json();

      const agentData = data[name];
      if (!agentData) return;

      const healthEl = document.getElementById(`agent-health-${name}`);
      if (healthEl) {
        const isActive = agentData.active !== false;
        healthEl.innerHTML = `<span class="status-pill ${isActive ? 'success' : 'danger'}">${isActive ? 'OPERATIONAL' : 'INACTIVE'}</span>`;
      }

      // Update pid  
      const pidEl = document.getElementById(`agent-pid-${name}`);
      if (pidEl) {
        pidEl.textContent = agentData.pid ? `PID_${agentData.pid}` : 'N/A';
        pidEl.classList.add(');
        setTimeout(() => pidEl.classList.remove('), 1000);
      }

      // Update capabilities
      const capsEl = document.getElementById(`agent-caps-${name}`);
      if (capsEl) {
        const caps = agentData.capabilities || ['STANDARD'];
        capsEl.innerHTML = caps.map(c => 
          `<span class="status-pill active primary">${c}</span>`
        ).join(');
      }

      // Update privilege
      const privEl = document.getElementById(`agent-priv-${name}`);
      if (privEl) {
        const isRoot = agentData.root === true;
        privEl.innerHTML = `<span class="status-pill ${isRoot ? 'warning' : 'success'}">${isRoot ? 'ROOT_ACCESS' : 'USER_LEVEL'}</span>`;
      }

      this.renderMetrics(name, agentData);
    } catch (e) {
      console.error('[AGENT_DETAIL] Failed to load agent details:', e);
    }
  }

  setupControls() {
    const restartBtn = document.getElementById(`btn-restart-${this.agentName}`);
    const stopBtn = document.getElementById(`btn-stop-${this.agentName}`);
    
    if (restartBtn) restartBtn.onclick = () => this.handleAction('restart');
    if (stopBtn) stopBtn.onclick = () => this.handleAction('stop');

    // Specific controls
    if (this.agentName === 'vpn') {
      const conn = document.getElementById('btn-vpn-connect-main');
      const disc = document.getElementById('btn-vpn-disconnect-main');
      if (conn) conn.onclick = () => this.handleAgentApi('vpn', 'connect');
      if (disc) disc.onclick = () => this.handleAgentApi('vpn', 'disconnect');
    }

    if (this.agentName === 'firewall') {
      const block = document.getElementById('btn-firewall-block-main');
      const unblock = document.getElementById('btn-firewall-unblock-main');
      const flush = document.getElementById('btn-firewall-flush-main');
      if (block) block.onclick = () => {
        const ip = document.getElementById('block-ip-input-main')?.value;
        if (ip) this.handleAgentApi('firewall', 'block', { ip });
      };
      if (unblock) unblock.onclick = () => {
        const ip = document.getElementById('block-ip-input-main')?.value;
        if (ip) this.handleAgentApi('firewall', 'unblock', { ip });
      };
      if (flush) flush.onclick = () => {
        this.handleAgentApi('firewall', 'flush');
      };
    }
  }

  async handleAction(action) {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    const btn = document.getElementById(`btn-${action}-${this.agentName}`);
    const originalText = btn?.innerHTML;
    if (btn) btn.innerHTML = '<span class=">PROCESSING...</span>';

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch(`/api/agents/${this.agentName}/${action}`, { 
          method: 'POST',
          headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      const result = await res.json();
      if (result.success) {
        this.fetchStatus(this.agentName);
      }
    } catch (e) {
      console.error(`[AGENT_DETAIL] ${action} failed:`, e);
    } finally {
      if (btn) btn.innerHTML = originalText;
      this.isProcessing = false;
    }
  }

  async handleAgentApi(agent, action, body = {}) {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch(`/api/agents/${agent}/${action}`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-CT-Token': csrfToken || '
        },
        body: JSON.stringify(body)
      });
      const result = await res.json();
      if (result.success) {
        this.fetchStatus(this.agentName);
      }
    } catch (e) {
      console.error(`[AGENT_DETAIL] ${action} failed:`, e);
    } finally {
      this.isProcessing = false;
    }
  }

  renderMetrics(name, agentData) {
    const container = document.getElementById('agent-metrics-container');
    if (!container) return;

    if (name === 'firewall') {
      const metrics = agentData.metrics || {};
      container.innerHTML = `
        <div class="grid grid-cols-12 gap-8">
          <section class="col-span-12 t-panel glass-panel border-t-2 border-danger/40">
            <header class="flex justify-between items-center mb-10 pb-4 border-b border-white/5">
                <div class="flex items-center gap-4">
                   <div class="p-3 bg-danger/10 border border-danger/20 text-danger rounded-lg">
                      <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   </div>
                   <h3 class="tactical-title text-sm uppercase tracking-widest">BLOCKED_PERIMETER_IPS</h3>
                </div>
                <div class="status-pill active primary">SHA-256_VERIFIED</div>
            </header>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                ${metrics.blockedIps?.map(ip => `
                 <div class="p-4 bg-black/60 border border-white/5 flex items-center justify-between group hover:border-danger/40 rounded-lg">
                     <span class="mono-xs text-danger font-black uppercase tracking-widest">${ip}</span>
                     <button onclick="const t=document.querySelector('meta[name=\\'csrf-token\\']')?.content; fetch('/api/agents/firewall/unblock', {method:'POST', headers:{'Content-Type':'application/json', 'X-CT-Token': t}, body:JSON.stringify({ip: '${ip}'})}).then(() => location.reload())" 
                             class="opacity-0 mono-xs font-black uppercase text-slate-500 hover:text-white">PURGE</button>
                 </div>
               `).join(') || `
                   <div class="empty-state">
                     <div class="mono-xs font-bold text-slate-500 uppercase tracking-widest">No_Definitive_Blocks_Active</div>
                  </div>
               `}
            </div>
          </section>
          
          <section class="col-span-12 t-panel glass-panel border-t-2 border-slate-800">
            <header class="flex items-center gap-4 mb-10 pb-4 border-b border-white/5">
                <div class="p-3 bg-primary/10 border border-primary/20 text-primary rounded-lg">
                   <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                </div>
                <h3 class="tactical-title text-sm uppercase tracking-widest">DEEP_PACKET_INSPECTION_FEED</h3>
            </header>
            <div id="traffic-log-container" class="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar bg-black/40 rounded-xl p-4 border border-white/5 font-mono">
               <div class="p-12 text-center text-slate-700 uppercase tracking-[0.3em] ">Synchronizing_DPI_Stream...</div>
            </div>
          </section>
        </div>
      `;
      this.fetchTraffic();
    } else if (name === 'vpn') {
      container.innerHTML = `
        <div class="grid grid-cols-12 gap-8">
          <div class="col-span-12 lg:col-span-6 t-panel glass-panel border-t-2 border-primary/40 p-10">
             <header class="flex justify-between items-center mb-10 pb-4 border-b border-white/5">
                 <span class="metric-tag uppercase font-bold tracking-widest">Tunnel_Configuration</span>
                <span class="status-pill success">ENCRYPTED</span>
             </header>
             <div class="space-y-6">
                <div class="flex justify-between items-center p-4 bg-black/40 border border-white/5 rounded hover:translate-y-[-2px]">
                   <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Interface</span>
                   <span class="text-lg font-black text-primary tracking-tighter uppercase italic">wg0</span>
                </div>
                <div class="flex justify-between items-center p-4 bg-black/40 border border-white/5 rounded hover:translate-y-[-2px]">
                   <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Cipher_Suite</span>
                   <span class="text-lg font-black text-white tracking-tighter">ChaCha20-Poly1305</span>
                </div>
                <div class="flex justify-between items-center p-4 bg-black/40 border border-white/5 rounded hover:translate-y-[-2px]">
                   <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Handshake</span>
                   <span class="text-lg font-black text-success tracking-tighter uppercase">ESTABLISHED</span>
                </div>
             </div>
          </div>
          <div class="col-span-12 lg:col-span-6 t-panel glass-panel border-t-2 border-slate-800 p-10">
             <header class="flex justify-between items-center mb-10 pb-4 border-b border-white/5">
                <span class="metric-tag uppercase font-black tracking-widest">Traffic_Telemetry</span>
                <span class="mono-xs text-slate-700 font-bold uppercase tracking-widest">Live_IO_Feed</span>
             </header>
             <div class="space-y-6">
                <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded hover:translate-x-[2px]">
                   <div class="flex flex-col">
                      <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest mb-1">Egress_Volume</span>
                      <span class="text-4xl font-black text-white tracking-tighter uppercase tabular-nums">${(agentData.telemetry?.tx || 0).toFixed(2)} <span class="text-slate-700 text-xl">MB</span></span>
                   </div>
                   <div class="p-3 bg-primary/10 text-primary rounded-full ">
                      <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path d="M7 17l10-10M7 7h10v10"/></svg>
                   </div>
                </div>
                <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded hover:translate-x-[2px]">
                   <div class="flex flex-col">
                      <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest mb-1">Ingress_Volume</span>
                      <span class="text-4xl font-black text-white tracking-tighter uppercase tabular-nums">${(agentData.telemetry?.rx || 0).toFixed(2)} <span class="text-slate-700 text-xl">MB</span></span>
                   </div>
                   <div class="p-3 bg-success/10 text-success rounded-full ">
                      <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path d="M17 7L7 17m10 0H7V7"/></svg>
                   </div>
                </div>
             </div>
          </div>
        </div>
      `;
    }
  }

  async fetchTraffic() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/network/logs', {
          headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      const logs = await res.json();
      const logEl = document.getElementById('traffic-log-container');
      if (!logEl) return;
      if (!logs || logs.length === 0) {
        logEl.innerHTML = `
          <div class="py-24 flex flex-col items-center justify-center opacity-20">
             <div class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">No_Traffic_Signals_Intercepted</div>
          </div>
        `;
        return;
      }
      logEl.innerHTML = logs.map(l => {
        const isBlock = l.action === 'BLOCK';
        return `
          <div class="flex items-center gap-8 p-6 border-b border-white/[0.03] hover:bg-white/[0.02] group ">
            <span class="mono-xs text-slate-600 font-bold w-20">${new Date(l.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
            <span class="mono-xs font-bold w-16 ${l.direction === 'INBOUND' ? 'text-primary' : 'text-warning"">${l.direction.slice(0, 3)}</span>
            <span class="mono-xs flex-1 truncate text-slate-400 font-bold uppercase tracking-widest">
               ${window.escapeHTML(l.source)} <span class="text-slate-800 mx-2">→</span> ${window.escapeHTML(l.destination)}
            </span>
            <div class="flex items-center gap-6">
               <span class="status-pill ${isBlock ? 'danger' : 'success'}">${l.action}</span>
            </div>
          </div>
        `;
      }).join(');
    } catch {}
  }
}

customElements.define('agent-detail', AgentDetail);
