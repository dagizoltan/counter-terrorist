class FirewallAgent extends HTMLElement {
  connectedCallback() {
    this.fetchData();
    this.connectWS();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'METRICS_UPDATE' && payload.data?.firewall) {
          this.updateUI(payload.data.firewall);
        }
      } catch (e) {
        console.error('[FIREWALL-AGENT] WS parse error', e);
      }
    };

    ws.onclose = () => {
      setTimeout(() => this.connectWS(), 5000);
    };
  }

  async fetchData() {
    try {
      const res = await fetch('/api/agents/firewall/status');
      if (!res.ok) return;
      const data = await res.json();
      
      // Also fetch PID from agent status
      const agentRes = await fetch('/api/agent/status');
      const agentData = await agentRes.json();
      const pid = agentData.firewall?.pid;

      // Parse real iptables output for initial load
      const lines = (data.stdout || '').split('\n').filter(l => l.trim());
      const blockedIps = [];
      for (const line of lines) {
        const match = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match && (line.includes('DROP') || line.includes('REJECT') || line.includes('DENY'))) {
          blockedIps.push(match[1]);
        }
      }
      this.updateUI({ blockedCount: blockedIps.length, blockedIps, pid });
      this.fetchTraffic();
    } catch (e) {
      console.error('Failed to fetch firewall status:', e);
    }
  }

  async fetchTraffic() {
    try {
      const res = await fetch('/api/network/logs');
      if (!res.ok) return;
      const logs = await res.json();
      this.updateTrafficUI(logs);
    } catch (e) {
      console.error('Failed to fetch traffic logs:', e);
    }
  }

  updateUI(firewall) {
    // Update PID
    const pidEl = document.getElementById('fw-pid');
    if (pidEl) pidEl.textContent = firewall.pid ? `PID_${firewall.pid}` : 'N/A';

    // Update count
    const countEl = document.getElementById('fw-blocked-count');
    if (countEl) countEl.textContent = firewall.blockedCount?.toString() || '0';

    // Update list
    const listEl = document.getElementById('fw-blocked-list');
    if (listEl && firewall.blockedIps) {
      if (firewall.blockedIps.length === 0) {
        listEl.innerHTML = '<p class="text-slate-500 text-[9px] uppercase font-bold">No active blocks. System clean.</p>';
      } else {
        listEl.innerHTML = firewall.blockedIps.map(ip => 
          `<div class="flex justify-between items-center p-2 bg-black/40 border border-white/5 text-red-500 group">
            <span>${ip}</span>
            <div class="flex items-center gap-3">
              <button onclick="fetch('/api/agents/firewall/unblock', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ip:'${ip}'})}).then(() => location.reload())" class="hidden group-hover:block text-[8px] font-black uppercase underline text-slate-400 hover:text-white">Unblock</button>
              <span class="text-[9px] font-black uppercase">BLOCKED</span>
            </div>
          </div>`
        ).join('');
      }
    }
  }

  updateTrafficUI(logs) {
    const trafficEl = document.getElementById('fw-traffic-list');
    if (!trafficEl) return;
    if (!logs || logs.length === 0) {
      trafficEl.innerHTML = '<p class="text-slate-500 text-[9px] italic">No traffic recorded.</p>';
      return;
    }
    trafficEl.innerHTML = logs.map(l => `
      <div class="flex items-center justify-between p-2 border-b border-white/5 text-[10px] font-mono">
        <span class="text-slate-500">${new Date(l.timestamp).toLocaleTimeString([], {hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}</span>
        <span class="w-24 truncate text-slate-300">${l.source} -> ${l.destination}</span>
        <span class="${l.action === 'BLOCK' ? 'text-red-500' : 'text-green-500'} font-black">${l.action}</span>
      </div>
    `).join('');
  }
}
customElements.define('firewall-agent', FirewallAgent);
