import { apiGet } from "./api.js";
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
      const agentData = await apiGet('/api/agent/status');
      this.updateUI({ pid: agentData.firewall?.pid });
    } catch (e) { /* the PID tile simply stays as it is */ }
    this.fetchTraffic();
  }

  async fetchTraffic() {
    try {
      this.updateTrafficUI(await apiGet('/api/network/logs'));
    } catch (e) { /* the feed keeps its last frame */ }
  }

  /**
   * The PID tile, and nothing else.
   *
   * This used to also render #fw-blocked-list. It built that list from
   * metrics.firewall.blockedIps — which emitMetrics caps at .slice(0, 20) —
   * and, when that came back empty, by running /(\d+\.\d+\.\d+\.\d+)/ over
   * the raw iptables stdout on any line containing DROP/REJECT/DENY. It
   * truncated past 20 blocks, could not see an IPv6 block at all, and had no
   * way to show why an address was blocked or when it lapses.
   *
   * <block-list> reads /api/agents/firewall/blocklist instead, which returns
   * the enforcement records themselves. See islands/Blocklist.js.
   */
  updateUI(firewall) {
    const pidEl = document.getElementById('fw-pid');
    if (pidEl) pidEl.textContent = firewall.pid ? `PID_${firewall.pid}` : 'OFFLINE';

    const countEl = document.getElementById('fw-blocked-count');
    if (countEl && typeof firewall.blockedCount === 'number') {
      countEl.textContent = String(firewall.blockedCount);
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
