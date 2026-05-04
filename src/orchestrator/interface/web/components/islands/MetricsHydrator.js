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
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

    this._ws = new WebSocket(url.toString());
    const ws = this._ws;

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
    // Layer-01: Network & VPN
    if (m.vpn) {
      this.updateStatus('stat-vpn-status', m.vpn.telemetry?.status === 'ACTIVE' ? 'ENCRYPTED' : 'OFFLINE');
      this.updateStatus('stat-anon-mode', m.vpn.mode ?? 'OFFLINE');
      this.setText('stat-vpn-ip', m.vpn.telemetry?.exitIp || 'UNCONNECTED');
    }
    
    // Layer-02: Mesh & Consensus
    if (m.mesh) {
      const meshActive = m.mesh.verified ?? 0;
      const meshTotal = m.mesh.nodes ?? 0;
      this.setText('stat-mesh-nodes', meshTotal > 0 ? `${meshActive}` : '0');
      this.setText('stat-mesh-nodes-large', meshTotal > 0 ? `${meshActive}` : '0');
      this.setText('stat-mesh-total', meshTotal.toString());
      this.updateStatus('stat-mesh-quorum', m.mesh.quorum ? 'ESTABLISHED' : 'PENDING');
      this.setText('stat-mesh-health', `${m.mesh.health ?? 0}%`);
    }

    // Layer-03: Node & Hardware
    if (m.node) {
       if (m.node.memory) {
          this.setText('stat-mem-val', Math.floor((m.node.memory.used || 0) / 1024 / 1024));
          this.setText('stat-mem-percent', `${m.node.memory.percent || 0}%`);
       }
       if (m.node.cpu) {
          this.setText('stat-cpu-load', `${m.node.cpu.load ?? 0}%`);
          this.setText('stat-cpu-load-large', `${m.node.cpu.load ?? 0}%`);
       }
       this.updateStatus('stat-node-uptime', m.node.uptime || '0s');
    }

    // Layer-04: Firewall & Threat Ingress
    const blockedCount = m.firewall?.blockedCount ?? 0;
    this.setText('stat-fw-blocked', blockedCount.toLocaleString());
    this.setText('evt-blocked-count', blockedCount.toLocaleString());
    this.setText('evt-ban-count', (m.firewall?.activeBans ?? 0).toLocaleString());
    this.setText('evt-latency', `${m.firewall?.latency ?? 0.4}ms`);
    
    // Layer-05: Audit & Compliance
    if (m.audit) {
       this.updateStatus('stat-audit-chain', m.audit.chainVerified ? 'VERIFIED' : 'BROKEN');
        this.setText('stat-audit-score', `${m.audit.integrityScore ?? 0}%`);
        this.setText('stat-audit-score-large', `${m.audit.integrityScore ?? 0}%`);
    }

    // Layer-06: Honeypots & Deception
    if (m.honeypot) {
       this.setText('stat-honey-hits', (m.honeypot.totalHits ?? 0).toLocaleString());
       this.updateStatus('stat-honey-status', m.honeypot.active' ? 'ARMED' : 'STANDBY');
    }

    // Layer-07: Kernel Hardening
    if (m.kernel) {
       this.updateStatus('stat-kernel-aslr', m.kernel.aslr === '2' ? 'STRICT' : 'LOOSE');
       this.updateStatus('stat-kernel-syncookies', m.kernel.syncookies === '1' ? 'ENABLED' : 'DISABLED');
       this.updateStatus('stat-kernel-rpfilter', m.kernel.rp_filter === '1' ? 'ENABLED' : 'DISABLED');
    }

    // Layer-08: Policy & Governance
    if (m.policy) {
       this.updateStatus('stat-policy-mode', m.policy.mode || 'ADAPTIVE');
       this.setText('stat-policy-remediations', (m.policy.remediations ?? 0).toLocaleString());
    }

    // Layer-09: Component Synchronization
    window.dispatchEvent(new CustomEvent('metrics-update', { detail: m }));
  }

  setText(id, text) {
    const el = document.getElementById(id);
    if (el && el.textContent != text) {
       el.textContent = text;
       // Subtle high-fidelity update feedback
    }
  }

  updateStatus(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (el.textContent === value) return;

    el.textContent = value;
    
    // Reset and apply theme-based classes if it's a status-pill or has tactical formatting
    if (el.classList.contains('status-pill') || el.classList.contains('tactical-status')) {
       el.classList.remove('active, 'success', 'warning', 'danger', 'primary');
       
       const successValues = ['STRICT', 'ENABLED', 'VERIFIED', 'ACTIVE', 'BLOCKED', 'RUNNING', 'ENCRYPTED', 'ESTABLISHED', 'OPTIMAL', 'HARDENED', 'ARMED', 'COMPLIANT'];
       const warningValues = ['PARTIAL', 'LOOSE', 'PENDING', 'WARNING', 'DISTRIBUTED', 'STANDBY'];
       const primaryValues = ['WAIT', 'IDLE', 'MONITOR', 'ESTABLISHING'];

       if (successValues.includes(value.toUpperCase())) {
          el.classList.add('success');
          if (el.classList.contains('status-pill')) el.classList.add('active);
       } else if (warningValues.includes(value.toUpperCase())) {
          el.classList.add('warning');
       } else if (primaryValues.includes(value.toUpperCase())) {
          el.classList.add('primary');
       } else {
          el.classList.add('danger');
       }
    } else {
       // Just text color based on semantic value
       const successValues = ['STRICT', 'ENABLED', 'VERIFIED', 'ACTIVE', 'BLOCKED', 'RUNNING', 'ENCRYPTED', 'ESTABLISHED', 'OPTIMAL', 'HARDENED', 'ARMED', 'COMPLIANT'];
       if (successValues.includes(value.toUpperCase())) {
          el.style.color = 'var(--success)';
       } else if (['OFFLINE', 'BROKEN', 'NON_COMPLIANT', 'FAILURE', 'ERROR'].includes(value.toUpperCase())) {
          el.style.color = 'var(--danger)';
       }
    }
  }
}
customElements.define('metrics-hydrator', MetricsHydrator);
