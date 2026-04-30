class ThreatMap extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.animateAttacks();
  }

  animateAttacks() {
    const container = this.shadowRoot.getElementById('attacks');
    setInterval(() => {
      const x = Math.random() * 100;
      const y = Math.random() * 100;
      const attack = document.createElement('div');
      attack.className = 'attack-ping';
      attack.style.left = `${x}%`;
      attack.style.top = `${y}%`;
      container.appendChild(attack);
      setTimeout(() => attack.remove(), 2000);
    }, 1500);
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
        #attacks { position: absolute; inset: 0; z-index: 20; }
        .attack-ping {
          position: absolute; width: 4px; height: 4px; background: #ff0000;
          border-radius: 50%; box-shadow: 0 0 10px #f00;
          animation: ping 2s ease-out;
        }
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(10); opacity: 0; }
        }
        .scanner-line {
          position: absolute; width: 100%; height: 2px; background: rgba(255,0,0,0.2);
          top: 0; animation: scan 4s linear infinite;
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
