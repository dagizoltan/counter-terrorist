class VpnAgent extends HTMLElement {
  connectedCallback() {
    this.fetchData();
  }

  async fetchData() {
    try {
      const res = await fetch('/api/mesh/nodes');
      if (!res.ok) return;
      const data = await res.json();
      
      const statusDot = document.getElementById('vpn-status-dot');
      const statusLabel = document.getElementById('vpn-status-label');
      const statusDetails = document.getElementById('vpn-status-details');
      const peerCount = document.getElementById('vpn-peer-count');
      const selfNode = document.getElementById('vpn-self-node');

      if (selfNode) selfNode.textContent = data.local || 'unknown';
      
      const activePeers = data.peers.filter(p => p.status === 'ACTIVE');
      if (peerCount) peerCount.textContent = `${activePeers.length} / ${data.peers.length}`;

      if (data.peers.length > 0) {
        if (statusDot) { statusDot.className = 'w-8 h-8 bg-green-500 animate-pulse rounded-full'; }
        if (statusLabel) statusLabel.textContent = 'Mesh Tunnel Active';
        if (statusDetails) statusDetails.textContent = `${activePeers.length} peer(s) connected // Protocol: WireGuard // Encryption: ChaCha20-Poly1305`;
      } else {
        if (statusDot) { statusDot.className = 'w-8 h-8 bg-yellow-500 rounded-full'; }
        if (statusLabel) statusLabel.textContent = 'Solo Mode';
        if (statusDetails) statusDetails.textContent = 'No mesh peers discovered. Running as standalone node.';
      }
    } catch (e) {
      console.error('Failed to fetch VPN status:', e);
    }
  }
}
customElements.define('vpn-agent', VpnAgent);
