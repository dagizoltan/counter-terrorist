class AgentDetail extends HTMLElement {
  connectedCallback() {
    const agentName = this.getAttribute('data-agent');
    if (agentName) this.fetchStatus(agentName);
  }

  async fetchStatus(name) {
    try {
      const res = await fetch('/api/agent/status');
      if (!res.ok) return;
      const data = await res.json();

      // Update health
      const healthEl = document.getElementById(`agent-health-${name}`);
      if (healthEl) {
        const isActive = data[name]?.active !== false;
        healthEl.textContent = isActive ? 'OPERATIONAL' : 'INACTIVE';
        healthEl.className = isActive ? 'text-green-500' : 'text-red-500';
      }

      // Update PID  
      const pidEl = document.getElementById(`agent-pid-${name}`);
      if (pidEl) {
        pidEl.textContent = data[name]?.pid ? `PID_${data[name].pid}` : 'N/A';
      }

      // Update capabilities
      const capsEl = document.getElementById(`agent-caps-${name}`);
      if (capsEl) {
        const caps = data[name]?.capabilities || ['STANDARD'];
        capsEl.innerHTML = caps.map(c => 
          `<span class="px-2 py-0.5 bg-white/10 text-[9px] font-black uppercase">${c}</span>`
        ).join('');
      }

      // Update privilege
      const privEl = document.getElementById(`agent-priv-${name}`);
      if (privEl) {
        const isRoot = data[name]?.root === true;
        privEl.textContent = isRoot ? 'ROOT_ACCESS' : 'USER_LEVEL';
        privEl.className = isRoot ? 'text-yellow-500' : 'text-green-500';
      }
      // Update metrics-specific UI
      if (data[name]?.metrics) {
        const metrics = data[name].metrics;
        
        // Firewall: Blocked & Suspicious IPs
        if (name === 'firewall') {
           const container = document.getElementById('agent-metrics-container');
           if (container) {
              container.innerHTML = `
                <div class="space-y-10">
                   <div>
                      <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 italic opacity-50">Blocked_Perimeter_IPs</p>
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                         ${metrics.blockedIps?.map(ip => `
                           <div class="p-3 bg-danger/5 border border-danger/20 rounded text-[10px] font-mono text-danger flex items-center justify-between group hover:bg-danger/10 transition-all">
                              <span>${ip}</span>
                              <div class="w-1 h-1 bg-danger animate-pulse rounded-full group-hover:scale-150 transition-transform"></div>
                           </div>
                         `).join('') || ''}
                         ${(!metrics.blockedIps || metrics.blockedIps.length === 0) ? '<div class="col-span-full text-[9px] text-slate-600 italic">No IPs currently blocked.</div>' : ''}
                      </div>
                   </div>

                   <div>
                      <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 italic opacity-50">Suspicious_Entities (Behavioral_Watch)</p>
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                         ${metrics.suspiciousIps?.map(s => `
                           <div class="p-3 bg-warning/5 border border-warning/20 rounded flex items-center justify-between">
                              <div class="flex items-center gap-3">
                                 <div class="w-1 h-3 bg-warning/40"></div>
                                 <span class="text-[10px] font-mono text-warning">${s.ip}</span>
                              </div>
                              <div class="flex items-center gap-4">
                                 <span class="text-[8px] font-black text-slate-600 uppercase">${s.attempts} ATTEMPTS</span>
                                 <div class="px-2 py-0.5 bg-warning/10 text-warning text-[8px] font-black uppercase rounded">Under_Scrutiny</div>
                              </div>
                           </div>
                         `).join('') || ''}
                         ${(!metrics.suspiciousIps || metrics.suspiciousIps.length === 0) ? '<div class="col-span-full text-[9px] text-slate-600 italic">No suspicious activity detected.</div>' : ''}
                      </div>
                   </div>
                </div>
              `;
           }
        }

        // VPN: Connection info
        if (name === 'vpn') {
           const container = document.getElementById('agent-metrics-container');
           if (container) {
              container.innerHTML = `
                <div class="p-4 bg-black/40 border border-white/5 rounded-lg">
                   <div class="flex justify-between items-center mb-4">
                      <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Tunnel_Identity</span>
                      <span class="text-[10px] font-mono text-cyber">wg0</span>
                   </div>
                   <div class="space-y-2">
                      <div class="flex justify-between text-[9px]">
                         <span class="text-slate-600">HANDSHAKE</span>
                         <span class="text-white">${metrics.active ? 'VALID' : 'NONE'}</span>
                      </div>
                      <div class="flex justify-between text-[9px]">
                         <span class="text-slate-600">THROUGHPUT</span>
                         <span class="text-white">0 B/s</span>
                      </div>
                   </div>
                </div>
              `;
           }
        }
      }
    } catch (e) {
      console.error('Failed to load agent details:', e);
    }
  }
}
customElements.define('agent-detail', AgentDetail);
