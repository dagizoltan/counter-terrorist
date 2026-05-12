class MetricsHydrator extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
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
      console.warn('[METRICS-HYDRATOR] Initial fetch failed');
    }
  }

  connect() {
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

    // SEC-05: Authenticated WebSocket Handshake
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    if (csrfToken) {
        url.searchParams.set('token', csrfToken);
    }

    this._ws = new WebSocket(url.toString());
    const ws = this._ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        const isMetrics = payload.type === 'METRICS_UPDATE' || (payload.type === 'DEBUG' && payload.subType === 'METRICS_UPDATE');
        if (isMetrics && payload.data) {
          this.updateMetrics(payload.data);
        }
      } catch (e) {}
    };

    ws.onclose = () => {
      this._reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  disconnectedCallback() {
    clearTimeout(this._reconnectTimer);
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
    }
  }

  updateMetrics(m) {
    if (m.vpn) {
      this.updateStatus('stat-vpn-status', m.vpn.active ? 'ENCRYPTED' : 'OFFLINE');
      this.updateStatus('stat-anon-mode', m.vpn.mode ?? 'OFFLINE');
      this.setText('stat-vpn-ip', m.vpn.exitIp || 'UNCONNECTED');
    }
    
    if (m.mesh) {
      const meshActive = m.mesh.activeNodes ?? 0;
      const meshTotal = m.mesh.totalNodes ?? 0;
      this.setText('stat-mesh-nodes', meshActive.toString());
      this.setText('stat-mesh-nodes-large', meshActive.toString());
      this.setText('stat-mesh-total', meshTotal.toString());
      this.updateStatus('stat-mesh-quorum', meshActive > 0 ? 'ESTABLISHED' : 'PENDING');
    }

    if (m.node) {
       if (m.node.memory) {
          this.setText('stat-mem-val', Math.floor((m.node.memory.used || 0) / 1024 / 1024));
          this.setText('stat-mem-percent', `${m.node.memory.percent || 0}%`);
       }
       if (m.node.cpu) {
          this.setText('stat-cpu-load', `${m.node.cpu.load ?? 0}%`);
          this.setText('stat-cpu-load-large', `${m.node.cpu.load ?? 0}%`);
       }
    }

    const blockedCount = m.firewall?.blockedCount ?? 0;
    this.setText('stat-fw-blocked', blockedCount.toLocaleString());
    this.setText('evt-blocked-count', blockedCount.toLocaleString());
    
    if (m.firewall) {
        this.updateStatus('stat-fw-grid', m.firewall.rules > 0 ? 'ARMED' : 'BYPASS');
    }
    
    if (m.audit) {
        this.updateStatus('stat-audit-chain', m.audit.chainVerified ? 'VERIFIED' : 'BROKEN');
        this.setText('stat-audit-score', `${m.node?.integrityScore ?? 0}%`);
        this.setText('stat-audit-score-large', `${m.node?.integrityScore ?? 0}%`);
    }

    if (m.honeypot) {
       this.setText('stat-honey-hits', (m.honeypot.totalHits ?? 0).toLocaleString());
       this.updateStatus('stat-honey-status', m.honeypot.activeDecoys > 0 ? 'ARMED' : 'STANDBY');
    }

    if (m.kernel) {
       this.updateStatus('stat-kernel-aslr', m.kernel.aslr === '2' ? 'STRICT' : 'LOOSE');
       this.updateStatus('stat-kernel-syncookies', m.kernel.syncookies === '1' ? 'ENABLED' : 'DISABLED');
    }

    if (m.policy) {
       this.updateStatus('stat-policy-mode', m.policy.mode || 'ADAPTIVE');
       this.setText('stat-policy-remediations', (m.policy.remediations ?? 0).toLocaleString());
    }

    window.dispatchEvent(new CustomEvent('metrics-update', { detail: m }));
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent != text) {
       el.textContent = text;
    }
  }

  updateStatus(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.textContent === value) return;
    el.textContent = value;
    
    if (el.classList.contains('status-pill') || el.classList.contains('tactical-status')) {
       el.classList.remove('active', 'success', 'warning', 'danger', 'primary');
       const successValues = ['STRICT', 'ENABLED', 'VERIFIED', 'ACTIVE', 'BLOCKED', 'RUNNING', 'ENCRYPTED', 'ESTABLISHED', 'OPTIMAL', 'HARDENED', 'ARMED', 'COMPLIANT', 'OPERATIONAL'];
       const warningValues = ['PARTIAL', 'LOOSE', 'PENDING', 'WARNING', 'DISTRIBUTED', 'STANDBY', 'BOOTING', 'DEGRADED'];
       const primaryValues = ['WAIT', 'IDLE', 'MONITOR', 'ESTABLISHING'];

       if (successValues.includes(value.toUpperCase())) {
          el.classList.add('success');
          if (el.classList.contains('status-pill')) el.classList.add('active');
       } else if (warningValues.includes(value.toUpperCase())) {
          el.classList.add('warning');
       } else if (primaryValues.includes(value.toUpperCase())) {
          el.classList.add('primary');
       } else {
          el.classList.add('danger');
       }
    }
  }
}
customElements.define('metrics-hydrator', MetricsHydrator);
