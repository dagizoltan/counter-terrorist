class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; width: 100%; background: #000; border: 1px solid rgba(255,255,255,0.05); }
        .map-container { position: relative; width: 100%; height: 100%; overflow: hidden; }
        .grid { 
            position: absolute; width: 100%; height: 100%; 
            background-image: radial-gradient(rgba(255,255,255,0.1) 1px, transparent 1px); 
            background-size: 20px 20px; 
        }
        .ping {
            position: absolute; width: 4px; height: 4px; background: #ff0000;
            border-radius: 50%; box-shadow: 0 0 10px #ff0000;
            animation: ping-anim 2s infinite;
        }
        @keyframes ping-anim {
            0% { transform: scale(1); opacity: 1; }
            100% { transform: scale(10); opacity: 0; }
        }
        .country-label {
            position: absolute; color: #fff; font-family: 'Inter', sans-serif;
            font-size: 6px; font-weight: 900; text-transform: uppercase;
            letter-spacing: 0.1em; opacity: 0.5;
        }
      </style>
      <div class="map-container">
        <div class="grid"></div>
        
        {/* Mock Pings */}
        <div class="ping" style="top: 30%; left: 20%"></div>
        <div class="country-label" style="top: 25%; left: 18%">NORTH_AMERICA</div>

        <div class="ping" style="top: 25%; left: 55%"></div>
        <div class="country-label" style="top: 20%; left: 52%">EUROPE_WEST</div>

        <div class="ping" style="top: 40%; left: 75%"></div>
        <div class="country-label" style="top: 35%; left: 72%">ASIA_EAST</div>

        <div class="ping" style="top: 70%; left: 80%"></div>
        <div class="country-label" style="top: 65%; left: 77%">OCEANIA</div>
      </div>
    `;
  }
}

customElements.define('threat-map', ThreatMap);
