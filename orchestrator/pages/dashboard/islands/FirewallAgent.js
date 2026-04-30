class FirewallAgent extends HTMLElement {
  connectedCallback() {
    this.fetchData();
  }

  async fetchData() {
    try {
      const res = await fetch('/api/protection/firewall/status');
      if (!res.ok) return;
      const data = await res.json();
      
      // Parse real iptables output
      const lines = (data.stdout || '').split('\n').filter(l => l.trim());
      const blockedIps = [];
      for (const line of lines) {
        const match = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (match && (line.includes('DROP') || line.includes('REJECT'))) {
          blockedIps.push({ ip: match[1], reason: line.includes('DROP') ? 'DROPPED' : 'REJECTED' });
        }
      }

      // Update count
      const countEl = document.getElementById('fw-blocked-count');
      if (countEl) countEl.textContent = blockedIps.length.toString();

      // Update list
      const listEl = document.getElementById('fw-blocked-list');
      if (listEl) {
        if (blockedIps.length === 0) {
          listEl.innerHTML = '<p class="text-slate-500 text-[9px] uppercase font-bold">No active blocks. System clean.</p>';
        } else {
          listEl.innerHTML = blockedIps.slice(0, 20).map(b => 
            `<div class="flex justify-between p-2 bg-black/40 border border-white/5 text-red-500">
              <span>${b.ip}</span>
              <span class="text-[9px] font-black">${b.reason}</span>
            </div>`
          ).join('');
        }
      }
    } catch (e) {
      console.error('Failed to fetch firewall status:', e);
    }
  }
}
customElements.define('firewall-agent', FirewallAgent);
