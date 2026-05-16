/**
 * ThreatMap Island
 * High-fidelity Geospatial Vector Map using Leaflet.
 * Replaces legacy 3D globe for better tactical situational awareness.
 */
class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.map = null;
    this.markers = new Map();
    this.isInitialized = false;
  }

  async connectedCallback() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    this.style.display = 'block';
    this.style.width = '100%';
    this.style.height = '100%';

    await this.loadDependencies();
    this.initMap();
    this.connectWS();
    this.fetchHistoricalThreats();
  }

  async loadDependencies() {
    return new Promise((resolve) => {
      if (window.L) return resolve();

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }

  initMap() {
    const L = window.L;
    
    // Initialize map with a dark tactical theme
    this.map = L.map(this, {
      center: [20, 0],
      zoom: 3,
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true
    });

    // CartoDB Dark Matter - High contrast for tactical visualization
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(this.map);

    L.control.zoom({ position: 'bottomright' }).addTo(this.map);
  }

  async fetchHistoricalThreats() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const resp = await fetch('/api/threats/identified?limit=200', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (resp.ok) {
        const { threats } = await resp.json();
        threats.forEach(t => {
          if (t.geo && t.geo.lat && t.geo.lon) {
            this.plotThreat(t.indicator, t.geo.lat, t.geo.lon, t.threatType, t.blocked);
          }
        });
      }
    } catch (e) {
      console.error('[ThreatMap] Failed to fetch historical data:', e);
    }
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new SharedWebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'AUDIT_EVENT' && payload.data?.type === 'THREAT') {
           const threat = payload.data.data;
           if (threat?.geo?.lat) {
             this.plotThreat(threat.indicator, threat.geo.lat, threat.geo.lon, threat.threatType, false, true);
           }
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connectWS(), 5000);
  }

  plotThreat(indicator, lat, lon, type, blocked, isNew = false) {
    if (!this.map || !lat || !lon) return;
    const L = window.L;

    // Remove existing marker for this indicator if it exists
    if (this.markers.has(indicator)) {
      this.map.removeLayer(this.markers.get(indicator));
    }

    const color = blocked ? '#64748b' : '#ef4444'; // Muted if blocked, red if active
    const pulseClass = isNew ? 'marker-pulse' : '';

    const markerHtml = `
      <div class="tactical-marker ${pulseClass}" style="background: ${color}; box-shadow: 0 0 10px ${color}">
        <div class="marker-inner"></div>
      </div>
    `;

    const icon = L.divIcon({
      html: markerHtml,
      className: 'custom-div-icon',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    const marker = L.marker([lat, lon], { icon }).addTo(this.map);
    
    marker.bindPopup(`
      <div class="mono-xs bg-black/90 p-4 border border-white/10 rounded shadow-2xl">
        <div class="text-primary font-black mb-2 uppercase tracking-widest">${indicator}</div>
        <div class="text-slate-500 uppercase text-[8px] mb-2">${type || 'UNKNOWN_THREAT'}</div>
        <div class="status-pill ${blocked ? 'neutral' : 'danger'} text-[7px]">${blocked ? 'ISOLATED' : 'ACTIVE_THREAT'}</div>
      </div>
    `, {
      className: 'tactical-popup',
      closeButton: false
    });

    this.markers.set(indicator, marker);

    if (isNew) {
      // Pan to new threat if it's live
      // this.map.panTo([lat, lon]);
    }
  }
}

// Inject tactical styles
const style = document.createElement('style');
style.textContent = `
  .tactical-marker {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid white;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .marker-inner {
    width: 4px;
    height: 4px;
    background: white;
    border-radius: 50%;
  }
  .marker-pulse {
    animation: marker-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
  @keyframes marker-ping {
    75%, 100% {
      transform: scale(2.5);
      opacity: 0;
    }
  }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip {
    background: transparent !important;
    box-shadow: none !important;
    padding: 0 !important;
  }
`;
document.head.appendChild(style);

customElements.define('threat-map', ThreatMap);
