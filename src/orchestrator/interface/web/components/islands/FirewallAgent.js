class FirewallAgent extends HTMLElement {
  connectedCallback() {
    this.fetchData();
    this.connectWS();
    this.setupDelegation();
  }

  setupDelegation() {
    const listEl = document.getElementById('fw-blocked-list');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="unblock"]');
        if (btn) {
          const ip = btn.getAttribute('data-ip');
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
          fetch('/api/agents/firewall/unblock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CT-Token': csrfToken || '' },
            body: JSON.stringify({ ip })
          }).then(() => location.reload());
        }
      });
    }
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

    // SEC-05: Authenticated WebSocket Handshake
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) {
        url.searchParams.set('token', csrfToken);
    }

    const ws = new SharedWebSocket(url.toString());

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if ((payload.type === 'METRICS_UPDATE' || (payload.type === 'DEBUG' && payload.subType === 'METRICS_UPDATE')) && payload.data?.firewall) {
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

      let blockedIps = [];
      
      // Handle Sentinel (JSON), Unified State (blocked_ips), or UFW (Text) fallback
      if (data.blocked_ips) {
        blockedIps = data.blocked_ips;
      } else if (data.data && data.data.blocked_ips) {
        blockedIps = data.data.blocked_ips;
      } else {
        const lines = (data.stdout || '').split('\n').filter(l => l.trim());
        for (const line of lines) {
          const match = line.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match && (line.includes('DROP') || line.includes('REJECT') || line.includes('DENY'))) {
            blockedIps.push(match[1]);
          }
        }
      }
      
      this.updateUI({ blockedCount: blockedIps.length, blockedIps, pid });
      this.fetchTraffic();
    } catch (e) {
      console.error("FirewallAgent fetch error:", e);
    }
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
            <span class="mono-xs font-black text-slate-500 uppercase tracking-widest italic">No Active Blocks Detected</span>
          </div>
        `;
      } else {
        listEl.innerHTML = (firewall.blockedIps || []).map(ip => {
          const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
          return `
            <div class="flex justify-between items-center p-4 bg-black/40 border border-white/5 group hover:border-danger/30 rounded transition-colors">
              <div class="flex flex-col gap-1">
                 <span class="mono-xs text-slate-500 font-black tracking-widest uppercase">Target Address</span>
                 <span class="mono-sm font-black text-danger uppercase tracking-widest">${window.escapeHTML(ip)}</span>
              </div>
              <div class="flex items-center gap-6">
                <button data-action="unblock" data-ip="${window.escapeHTML(ip)}"
                        class="opacity-0 group-hover:opacity-100 mono-xs font-black uppercase text-slate-500 hover:text-white decoration-white/20 tracking-widest transition-opacity">Release IP</button>
                <div class="flex items-center gap-3">
                   <div class="dot danger"></div>
                   <span class="mono-xs font-black uppercase text-danger tracking-widest">Quarantined</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
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
    trafficEl.innerHTML = (logs || []).map(l => {
      const isBlocked = l.action === 'BLOCK';
      const botScore = l.botScore || 0;
      const botIndicator = botScore > 0.8 ? '<span class="text-[8px] px-2 py-0.5 bg-danger/20 text-danger rounded border border-danger/30 font-black ml-4">BOT_PROB_HIGH</span>' : '';

      return `
        <div class="flex items-center justify-between p-4 border-b border-white/[0.03] hover:bg-white/[0.02] group transition-colors">
          <span class="mono-xs text-slate-600 font-bold w-24">${new Date(l.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
          <div class="flex-1 flex items-center gap-4 px-4 overflow-hidden">
             <span class="mono-xs text-slate-400 font-black uppercase truncate tracking-tighter">${window.escapeHTML(l.source)}</span>
             <span class="text-slate-800 text-[10px] font-black">→</span>
             <span class="mono-xs text-slate-400 font-black uppercase truncate tracking-tighter">${window.escapeHTML(l.destination)}</span>
             ${botIndicator}
          </div>
          <div class="flex items-center gap-3 w-32 justify-end">
             <span class="mono-xs font-black uppercase tracking-widest ${isBlocked ? 'text-danger' : 'text-success'}">${window.escapeHTML(l.action)}</span>
             <div class="dot ${isBlocked ? 'danger' : 'active'}"></div>
          </div>
        </div>
      `;
    }).join('');
  }
}
customElements.define('firewall-agent', FirewallAgent);
