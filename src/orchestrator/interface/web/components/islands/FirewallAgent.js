class FirewallAgent extends HTMLElement {
  connectedCallback() {
    this.fetchData();
    this.connectWS();
  }

  connectWS() {
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${globalThis.location.host}/api/ws/events`);

    // SEC-05: Authenticated WebSocket Handshake
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) {
        url.searchParams.set('token', csrfToken);
    }

    const ws = new SharedWebSocket();

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

      // Retrieve metrics snapshot for direct blockedIps array from FirewallManager
      const metricsRes = await fetch('/api/metrics', { headers });
      let blockedIps = [];
      if (metricsRes.ok) {
        const metrics = await metricsRes.json();
        if (metrics.firewall?.blockedIps && Array.isArray(metrics.firewall.blockedIps)) {
          blockedIps = metrics.firewall.blockedIps;
        }
      }

      if (blockedIps.length === 0 && data.stdout) {
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
          <div class="p-5 text-center t-panel glass-panel border-dashed opacity-50">
            <span class="eyebrow italic">No Active Blocks Detected</span>
          </div>
        `;
      } else {
        // SEC-03: DOM-based XSS Hardening.
        // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
        listEl.innerHTML = '';
        (firewall.blockedIps || []).forEach(ip => {
          const item = document.createElement('div');
          item.className = "flex justify-between items-center p-4 bg-black/40 border border-white/5 group hover:border-danger/30 rounded transition-colors";

          const info = document.createElement('div');
          info.className = "flex flex-col gap-1";
          info.innerHTML = `<span class="eyebrow">Target Address</span>`;
          const ipSpan = document.createElement('span');
          ipSpan.className = "mono-sm font-black text-danger uppercase tracking-widest";
          ipSpan.textContent = ip;
          info.appendChild(ipSpan);

          const actions = document.createElement('div');
          actions.className = "flex items-center gap-6";
          const releaseBtn = document.createElement('button');
          releaseBtn.className = "opacity-0 group-hover:opacity-100 mono-xs font-black uppercase text-slate-500 hover:text-white decoration-white/20 tracking-widest transition-opacity";
          releaseBtn.textContent = "Release IP";
          releaseBtn.onclick = () => {
              const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
              fetch('/api/agents/firewall/unblock', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'X-CT-Token': csrfToken || '' },
                  body: JSON.stringify({ ip })
              }).then(() => location.reload());
          };

          const statusDiv = document.createElement('div');
          statusDiv.className = "flex items-center gap-3";
          statusDiv.innerHTML = `<div class="dot danger"></div><span class="eyebrow" data-tone="danger">Quarantined</span>`;

          actions.appendChild(releaseBtn);
          actions.appendChild(statusDiv);
          item.appendChild(info);
          item.appendChild(actions);
          listEl.appendChild(item);
        });
      }
    }
  }

  updateTrafficUI(logs) {
    const trafficEl = document.getElementById('fw-traffic-list');
    if (!trafficEl) return;
    if (!logs || logs.length === 0) {
      trafficEl.innerHTML = `
        <div class="eyebrow p-5 text-center">
           Awaiting_Packet_Signals...
        </div>
      `;
      return;
    }
    // SEC-03: DOM-based XSS Hardening.
    // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
    trafficEl.innerHTML = '';
    (logs || []).forEach(l => {
      const isBlocked = l.action === 'BLOCK';
      const botScore = l.botScore || 0;

      const logEl = document.createElement('div');
      logEl.className = "flex items-center justify-between p-4 border-b border-white/[0.03] hover:bg-white/[0.02] group transition-colors";

      const timeSpan = document.createElement('span');
      timeSpan.className = "mono-xs text-slate-600 font-bold w-24";
      timeSpan.textContent = new Date(l.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'});

      const flowDiv = document.createElement('div');
      flowDiv.className = "flex-1 flex items-center gap-4 px-4 overflow-hidden";

      const srcSpan = document.createElement('span');
      srcSpan.className = "mono-xs text-slate-400 font-black uppercase truncate tracking-tighter";
      srcSpan.textContent = l.source;

      const arrowSpan = document.createElement('span');
      arrowSpan.className = "text-slate-800 text-[10px] font-black";
      arrowSpan.textContent = "→";

      const dstSpan = document.createElement('span');
      dstSpan.className = "mono-xs text-slate-400 font-black uppercase truncate tracking-tighter";
      dstSpan.textContent = l.destination;

      flowDiv.appendChild(srcSpan);
      flowDiv.appendChild(arrowSpan);
      flowDiv.appendChild(dstSpan);

      if (botScore > 0.8) {
          const botSpan = document.createElement('span');
          botSpan.className = "text-[8px] px-2 py-0.5 bg-danger/20 text-danger rounded border border-danger/30 font-black ml-4";
          botSpan.textContent = "BOT_PROB_HIGH";
          flowDiv.appendChild(botSpan);
      }

      const statusDiv = document.createElement('div');
      statusDiv.className = "flex items-center gap-3 w-32 justify-end";

      const actionSpan = document.createElement('span');
      actionSpan.className = `mono-xs font-black uppercase tracking-widest ${isBlocked ? 'text-danger' : 'text-success'}`;
      actionSpan.textContent = l.action;

      const dot = document.createElement('div');
      dot.className = `dot ${isBlocked ? 'danger' : 'active'}`;

      statusDiv.appendChild(actionSpan);
      statusDiv.appendChild(dot);

      logEl.appendChild(timeSpan);
      logEl.appendChild(flowDiv);
      logEl.appendChild(statusDiv);
      trafficEl.appendChild(logEl);
    });
  }
}
customElements.define('firewall-agent', FirewallAgent);
