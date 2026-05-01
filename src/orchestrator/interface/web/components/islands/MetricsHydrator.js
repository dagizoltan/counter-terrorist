class MetricsHydrator extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    // Fetch initial snapshot immediately
    this.fetchInitial();
    this.connect();
  }

  async fetchInitial() {
    try {
      const res = await fetch('/api/metrics');
      if (res.ok) {
        const data = await res.json();
        this.updateMetrics(data);
      }
    } catch (e) {
      console.warn('[METRICS-HYDRATOR] Initial fetch failed, waiting for WS stream');
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

    const ws = new WebSocket(url.toString());

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
    // Layer-01: Network
    this.setText('stat-vpn-status', m.vpn?.telemetry?.status === 'ACTIVE' ? 'ENCRYPTED' : 'OFFLINE');
    this.setText('stat-anon-mode', m.vpn?.mode ?? 'OFF');
    this.setText('stat-vpn-rotations', `${m.vpn?.telemetry?.rotations ?? 0} Rotations`);
    this.setText('stat-geo-diversity', `${m.geo?.totalOrigins ?? 0} Origins`);

    // Layer-02: Mesh
    const meshActive = m.mesh?.verified ?? 0;
    const meshTotal = m.mesh?.nodes ?? 0;
    this.setText('stat-mesh-nodes', meshTotal > 0 ? `${meshActive} / ${meshTotal} Nodes` : 'SOLO');
    this.setText('stat-mesh-quorum', m.mesh?.quorum ? 'ESTABLISHED' : 'PENDING');

    // Layer-03: Node
    this.setText('stat-forensics-ebpf-status', m.node?.ebpf ? 'RUNNING' : 'STOPPED');
    this.setText('stat-protection-count', `${m.node?.integrityScore ?? 100}% SCORE`);

    // Legacy/Shared
    this.setText('stat-fw-blocked', m.firewall?.blockedCount ?? '0');
    this.setText('stat-audit-chain', m.audit?.chainVerified ? 'VERIFIED' : 'BROKEN');
    this.setStatusColor('stat-audit-chain', m.audit?.chainVerified ? 'VERIFIED' : 'BROKEN');
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
  }

  setStatusColor(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = el.className.replace(/text-\w+-\d+/g, '');
    if (['STRICT', 'ENABLED', 'VERIFIED', 'ACTIVE', 'BLOCKED'].includes(value)) {
      el.classList.add('text-green-500');
    } else if (['PARTIAL', 'LOOSE'].includes(value)) {
      el.classList.add('text-yellow-500');
    } else {
      el.classList.add('text-red-500');
    }
  }
}
customElements.define('metrics-hydrator', MetricsHydrator);
