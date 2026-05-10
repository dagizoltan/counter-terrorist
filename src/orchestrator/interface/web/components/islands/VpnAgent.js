class VpnAgent extends HTMLElement {
  connectedCallback() {
    this.fetchData();
    this.setupControls();
  }

  setupControls() {
    const connBtn = document.getElementById('vpn-connect-btn');
    const discBtn = document.getElementById('vpn-disconnect-btn');
    const csrf = document.querySelector('meta[name="csrf-token"]')?.content;

    if (connBtn) {
      connBtn.onclick = async () => {
        try {
          const res = await fetch('/api/agents/vpn/connect', { 
            method: 'POST', 
            headers: { 'X-CT-Token': csrf, 'Content-Type': 'application/json' },
            body: JSON.stringify({}) 
          });
          const data = await res.json();
          alert(data.message || 'Tunnel Link Requested');
          this.fetchData();
        } catch (e) { alert(`Link Failed: ${e.message}`); }
      };
    }

    if (discBtn) {
      discBtn.onclick = async () => {
        try {
          const res = await fetch('/api/agents/vpn/disconnect', { 
            method: 'POST', 
            headers: { 'X-CT-Token': csrf } 
          });
          const data = await res.json();
          alert(data.message || 'Severance Requested');
          this.fetchData();
        } catch (e) { alert(`Severance Failed: ${e.message}`); }
      };
    }
  }

  async fetchData() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/mesh/nodes', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (!res.ok) return;
      const data = await res.json();
      
      const statusDot = document.getElementById('vpn-status-dot');
      const statusLabel = document.getElementById('vpn-status-label');
      const statusDetails = document.getElementById('vpn-status-details');
      const peerCount = document.getElementById('vpn-peer-count');
      const selfNode = document.getElementById('vpn-self-node');

      if (selfNode) selfNode.textContent = data.local || 'MESH_PENDING';
      
      const activePeers = data.peers.filter(p => p.status === 'ACTIVE');
      if (peerCount) peerCount.textContent = `${activePeers.length} / ${data.peers.length}`;

      if (data.peers.length > 0) {
        if (statusDot) { 
          statusDot.className = 'w-12 h-12 bg-success';
          statusDot.style.background = 'var(--success)';
        }
        if (statusLabel) statusLabel.textContent = 'MESH_TUNNEL_ACTIVE';
        if (statusDetails) statusDetails.textContent = `${activePeers.length} peer(s) verified // WireGuard Sync: HIGH_STABILITY`;
      } else {
        if (statusDot) { 
          statusDot.className = 'w-12 h-12 bg-warning';
          statusDot.style.background = 'var(--warning)';
        }
        if (statusLabel) statusLabel.textContent = 'STANDALONE_MODE';
        if (statusDetails) statusDetails.textContent = 'No mesh peers discovered. Initiating autonomous fallback.';
      }
    } catch (e) {
      console.error('Failed to fetch VPN status:', e);
    }
  }
}
customElements.define('vpn-agent', VpnAgent);
