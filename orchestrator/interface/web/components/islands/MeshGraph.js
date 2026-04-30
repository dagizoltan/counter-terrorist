class MeshGraph extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.fetchNodes();
  }

  async fetchNodes() {
    try {
      const res = await fetch('/api/mesh/nodes');
      const data = await res.json();
      this.updateGraph(data);
    } catch (e) {
      console.error("Failed to fetch mesh nodes", e);
    }
  }

  updateGraph(data) {
    const container = this.shadowRoot.getElementById('graph-container');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Center Node (Self)
    const center = document.createElement('div');
    center.className = 'node local';
    center.innerHTML = `<div class="pulse"></div><span class="label">${data.local}</span>`;
    container.appendChild(center);

    // Peer Nodes
    data.peers.forEach((peer, i) => {
      const angle = (i / data.peers.length) * 2 * Math.PI;
      const x = Math.cos(angle) * 80 + 100;
      const y = Math.sin(angle) * 80 + 100;
      
      const node = document.createElement('div');
      node.className = `node peer ${peer.status.toLowerCase()}`;
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      node.innerHTML = `<span class="label">${peer.id}</span><span class="latency">${peer.latency}</span>`;
      container.appendChild(node);

      // Draw connection line
      const line = document.createElement('div');
      line.className = 'connection';
      line.style.width = '80px';
      line.style.transform = `rotate(${angle}rad)`;
      line.style.left = '100px';
      line.style.top = '100px';
      container.appendChild(line);
    });
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; width: 100%; position: relative; }
        #graph-container { position: relative; width: 200px; height: 200px; margin: 0 auto; }
        .node { 
          position: absolute; 
          width: 10px; height: 10px; 
          border-radius: 50%; 
          display: flex; flex-direction: column; align-items: center; 
          transform: translate(-50%, -50%);
        }
        .local { background: #fff; left: 100px; top: 100px; z-index: 10; }
        .peer { width: 6px; height: 6px; }
        .peer.active { background: #22c55e; box-shadow: 0 0 10px #22c55e; }
        .peer.inactive { background: #ef4444; }
        .label { 
          font-family: 'Inter', sans-serif; 
          font-size: 6px; font-weight: 900; color: #fff; 
          text-transform: uppercase; margin-top: 6px; white-space: nowrap;
          letter-spacing: 0.1em;
        }
        .latency { font-size: 5px; color: #475569; }
        .connection { 
          position: absolute; height: 1px; background: rgba(255,255,255,0.05); 
          transform-origin: left center; z-index: 1;
        }
        .pulse {
          position: absolute; width: 100%; height: 100%; border-radius: 50%;
          border: 1px solid #fff; animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
      </style>
      <div id="graph-container"></div>
    `;
  }
}

customElements.define('mesh-graph', MeshGraph);
