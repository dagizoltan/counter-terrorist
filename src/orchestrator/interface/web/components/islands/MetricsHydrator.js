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
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/metrics', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
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
    this.updateStatus('stat-vpn-status', m.vpn?.telemetry?.status === 'ACTIVE' ? 'ENCRYPTED' : 'OFFLINE');
    this.updateStatus('stat-anon-mode', m.vpn?.mode ?? 'OFFLINE');
    
    // Layer-02: Mesh
    const meshActive = m.mesh?.verified ?? 0;
    const meshTotal = m.mesh?.nodes ?? 0;
    this.setText('stat-mesh-nodes', meshTotal > 0 ? `${meshActive}` : '0');
    this.updateStatus('stat-mesh-quorum', m.mesh?.quorum ? 'ESTABLISHED' : 'PENDING');

    // Layer-03: Node
    if (m.node?.memory) {
       this.setText('stat-mem-val', Math.floor(m.node.memory.used / 1024 / 1024));
    }

    // Legacy/Shared
    this.setText('stat-fw-blocked', (m.firewall?.blockedCount ?? 0).toLocaleString());
    
    // Optional indicators if they exist in DOM
    if (document.getElementById('stat-audit-chain')) {
       this.updateStatus('stat-audit-chain', m.audit?.chainVerified ? 'VERIFIED' : 'BROKEN');
    }
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.innerText != text) {
       el.innerText = text;
       // Add a small flash effect on update
       el.classList.add('text-white');
       setTimeout(() => el.classList.remove('text-white'), 500);
    }
  }

  updateStatus(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (el.innerText === value) return;

    el.innerText = value;
    
    // Reset and apply theme-based classes if it's a status-pill
    if (el.classList.contains('status-pill')) {
       el.classList.remove('active', 'success', 'warning', 'danger', 'primary');
       
       const successValues = ['STRICT', 'ENABLED', 'VERIFIED', 'ACTIVE', 'BLOCKED', 'RUNNING', 'ENCRYPTED', 'ESTABLISHED', 'OPTIMAL', 'HARDENED'];
       const warningValues = ['PARTIAL', 'LOOSE', 'PENDING', 'WARNING', 'DISTRIBUTED'];
       const primaryValues = ['WAIT', 'IDLE', 'STANDBY', 'MONITOR'];

       if (successValues.includes(value)) {
         el.classList.add('active');
         el.style.borderColor = 'var(--success-glow)';
         el.style.color = 'var(--success)';
       } else if (warningValues.includes(value)) {
         el.classList.add('warning');
         el.style.borderColor = 'var(--warning-glow)';
         el.style.color = 'var(--warning)';
       } else if (primaryValues.includes(value)) {
         el.classList.add('active');
         el.style.borderColor = 'var(--primary-glow)';
         el.style.color = 'var(--primary)';
       } else {
         el.classList.add('danger');
         el.style.borderColor = 'var(--danger-glow)';
         el.style.color = 'var(--danger)';
       }
    } else {
       // Just text color
       const successValues = ['STRICT', 'ENABLED', 'VERIFIED', 'ACTIVE', 'BLOCKED', 'RUNNING', 'ENCRYPTED', 'ESTABLISHED', 'OPTIMAL', 'HARDENED'];
       if (successValues.includes(value)) {
         el.style.color = 'var(--success)';
       } else {
         el.style.color = 'var(--danger)';
       }
    }
  }
}
customElements.define('metrics-hydrator', MetricsHydrator);
