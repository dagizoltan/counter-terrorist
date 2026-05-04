class FirewallAgent extends HTMLElement {
  connectedCallback() {
    this.fetchData();
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https': ? 'wss': : 'ws':';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : '}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'METRICS_UPDATE' && payload.data?.firewall) {
          this.updateUI(payload.data.firewall);
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connectWS(), 5000);
  }

  async fetchData() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const headers = csrfToken ? { 'X-CT-Token': csrfToken } : {};
      
      const res = await fetch('/api/agents/firewall/status', { headers });
      if (!res.ok) return;
      const data = await res.json();
      
      const agentRes = await fetch('/api/agent/status', { headers });
      const agentData = await agentRes.json();
      const pid = agentData.firewall?.pid;

      const lines = (data.stdout || ').split('\n').filter(l => l.trim());
      const blockedIps = [];
      for (const line of lines) {
        const match = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match && (line.includes('DROP') || line.includes('REJECT') || line.includes('DENY'))) {
          blockedIps.push(match[1]);
        }
      }
      this.updateUI({ blockedCount: blockedIps.length, blockedIps, pid });
      this.fetchTraffic();
    } catch (e) {}
  }

  async fetchTraffic() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const headers = csrfToken ? { 'X-CT-Token': csrfToken } : {};
      const res = await fetch('/api/network/logs', { headers });
      if (!res.ok) return;
      const logs = await res.json();
      this.updateTrafficUI(logs);
    } catch (e) {}
  }

  updateUI(firewall) {
    const pidEl = document.getElementById('fw-pid');
    if (pidEl) pidEl.textContent = firewall.pid ? `PID_${firewall.pid}` : 'OFFLINE';

    const countEl = document.getElementById('fw-blocked-count');
    if (countEl) countEl.textContent = firewall.blockedCount?.toString() || '0';

    const listEl = document.getElementById('fw-blocked-list');
    if (listEl && firewall.blockedIps) {
      if (firewall.blockedIps.length === 0) {
        listEl.innerHTML = `
          <div class="p-12 text-center t-panel glass-panel border-dashed opacity-50">
            <span class="mono-xs font-black text-slate-500 uppercase tracking-widest italic">No_Active_Blocks_Detected</span>
          </div>
        `;
      } else {
        listEl.innerHTML = firewall.blockedIps.map(ip => {
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
          return `
            <div class="flex justify-between items-center p-4 bg-black/40 border border-white/5 group hover:border-danger/30 rounded ">
              <div class="flex flex-col gap-1">
                 <span class="mono-xs text-slate-500 font-black tracking-widest uppercase">Target_Address</span>
                 <span class="mono-sm font-black text-danger uppercase tracking-widest">${ip}</span>
              </div>
              <div class="flex items-center gap-6">
                <button onclick="fetch('/api/agents/firewall/unblock', {method:'POST', headers:{'Content-Type':'application/json', 'X-CT-Token':'${csrfToken || '}'}, body:JSON.stringify({ip:'${ip}'})}).then(() => location.reload())" 
                        class="opacity-0 mono-xs font-black uppercase text-slate-500 hover:text-white underline decoration-white/20 tracking-widest">Release_IP</button>
                <div class="flex items-center gap-3">
                   <div class="dot danger"></div>
                   <span class="mono-xs font-black uppercase text-danger tracking-widest">Quarantined</span>
                </div>
              </div>
            </div>
          `;
        }).join(');
      }
    }
  }

  updateTrafficUI(logs) {
    const trafficEl = document.getElementById('fw-traffic-list');
    if (!trafficEl) return;
    if (!logs || logs.length === 0) {
      trafficEl.innerHTML = `
        <div class="mono-xs text-slate-700  p-12 text-center uppercase tracking-widest font-black">
           Awaiting_Packet_Signals...
        </div>
      `;
      return;
    }
    trafficEl.innerHTML = logs.map(l => {
      const isBlocked = l.action === 'BLOCK';
      return `
        <div class="flex items-center justify-between p-4 border-b border-white/[0.03] hover:bg-white/[0.02] group ">
          <span class="mono-xs text-slate-600 font-bold w-24">${new Date(l.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
          <div class="flex-1 flex items-center gap-4 px-4 overflow-hidden">
             <span class="mono-xs text-slate-400 font-black uppercase truncate tracking-tighter">${l.source}</span>
             <span class="text-slate-800 text-[10px] font-black">→</span>
             <span class="mono-xs text-slate-400 font-black uppercase truncate tracking-tighter">${l.destination}</span>
          </div>
          <div class="flex items-center gap-3 w-24 justify-end">
             <span class="mono-xs font-black uppercase tracking-widest ${isBlocked ? 'text-danger' : 'text-success"">${l.action}</span>
             <div class="dot ${isBlocked ? 'danger' : 'active'}"></div>
          </div>
        </div>
      `;
    }).join(');
  }
}
customElements.define('firewall-agent', FirewallAgent);
