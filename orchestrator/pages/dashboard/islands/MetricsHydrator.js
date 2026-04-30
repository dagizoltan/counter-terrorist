class MetricsHydrator extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws/events`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'METRICS_UPDATE' && payload.data) {
          this.updateMetrics(payload.data);
        }
      } catch (e) {
        console.error('[METRICS-HYDRATOR] Failed to parse message', e);
      }
    };

    ws.onclose = () => {
      console.warn('[METRICS-HYDRATOR] Connection lost. Reconnecting in 5s...');
      setTimeout(() => this.connect(), 5000);
    };
  }

  updateMetrics(m) {
    this.setText('stat-fw-blocked', m.firewall.blockedCount);
    this.setText('stat-fw-rules', m.firewall.rules);
    this.setText('stat-mesh-nodes', `${m.mesh.activeNodes} Active`);
    this.setText('stat-mesh-handshakes', Math.floor(Math.random() * 100)); // Simulated real-time fluctuate
    this.setText('stat-forensics-procs', m.forensics.processCount);
    this.setText('stat-honeypot-active', m.honeypot.activeDecoys);
    this.setText('stat-honeypot-hits', m.honeypot.totalHits);
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }
}
customElements.define('metrics-hydrator', MetricsHydrator);
