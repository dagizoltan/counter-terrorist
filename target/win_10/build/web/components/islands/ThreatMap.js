class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'BLOCK' && payload.data?.ip) {
          this.plotIp(payload.data.ip);
        }
      } catch (e) {
        console.error('[THREAT-MAP] Failed to parse message', e);
      }
    };

    ws.onclose = () => {
      setTimeout(() => this.connect(), 5000);
    };
  }

  async plotIp(ip) {
    try {
      // Use ip-api.com for free GeoIP lookup (no auth required for small volume)
      const res = await fetch(`http://ip-api.com/json/${ip}`);
      if (!res.ok) return;
      const geo = await res.json();
      
      if (geo.lat && geo.lon) {
        // Convert lat/lon to map percentages
        // Assuming equirectangular projection for simplicity
        const x = (geo.lon + 180) * (100 / 360);
        const y = (90 - geo.lat) * (100 / 180);
        
        const container = this.shadowRoot.getElementById('attacks');
        const attack = document.createElement('div');
        attack.className = 'attack-ping';
        attack.style.left = `${x}%`;
        attack.style.top = `${y}%`;
        
        // Tooltip
        attack.title = `Blocked: ${ip}\nLocation: ${geo.city}, ${geo.country}`;
        
        container.appendChild(attack);
        setTimeout(() => attack.remove(), 2000);
      }
    } catch (e) {
      console.warn('[THREAT-MAP] GeoIP failed for', ip);
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; width: 100%; height: 100%; background: #000; position: relative; border: 1px solid rgba(255,255,255,0.05); }
        .map-base {
          width: 100%; height: 100%;
          background: url('https://upload.wikimedia.org/wikipedia/commons/8/80/World_map_-_low_resolution.svg') no-repeat center;
          background-size: cover;
          filter: invert(1) brightness(0.2) sepia(1) hue-rotate(180deg) saturate(2);
          opacity: 0.3;
        }
        #attacks { position: absolute; inset: 0; z-index: 20; pointer-events: none; }
        .attack-ping {
          position: absolute; width: 6px; height: 6px; background: #ff0000;
          border-radius: 50%; box-shadow: 0 0 15px #f00;
          animation: ping 2s ease-out;
          pointer-events: auto;
          cursor: crosshair;
        }
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(8); opacity: 0; }
        }
        .scanner-line {
          position: absolute; width: 100%; height: 2px; background: rgba(255,0,0,0.2);
          top: 0; animation: scan 4s linear infinite; pointer-events: none;
        }
        @keyframes scan {
          0% { top: 0; }
          100% { top: 100%; }
        }
      </style>
      <div class="map-base"></div>
      <div id="attacks"></div>
      <div class="scanner-line"></div>
    `;
  }
}
customElements.define('threat-map', ThreatMap);
