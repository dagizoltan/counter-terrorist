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
      const res = await fetch('/api/protection/firewall/status');
      if (!res.ok) return;
      const data = await res.json();
      
      // Parse real iptables output for initial load
      const lines = (data.stdout || '').split('\n').filter(l => l.trim());
      const blockedIps = [];
      for (const line of lines) {
        const match = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match && (line.includes('DROP') || line.includes('REJECT'))) {
          blockedIps.push(match[1]);
        }
      }
      this.updateUI({ blockedCount: blockedIps.length, blockedIps });
    } catch (e) {
      console.error('Failed to fetch firewall status:', e);
    }
  }

  updateUI(firewall) {
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
          `<div class="flex justify-between p-2 bg-black/40 border border-white/5 text-red-500">
            <span>${ip}</span>
            <span class="text-[9px] font-black uppercase">BLOCKED</span>
          </div>`
        ).join('');
      }
    }
  }
}
customElements.define('firewall-agent', FirewallAgent);
