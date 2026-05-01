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
      const token = document.querySelector('meta[name="api-token"]')?.content || "";
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/metrics', { headers });
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
    const token = document.querySelector('meta[name="api-token"]')?.content || "";
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);
    if (token) url.searchParams.set('token', token);

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
    // Firewall
    this.setText('stat-fw-blocked', m.firewall?.blockedCount ?? '—');
    this.setText('stat-fw-rules', m.firewall?.rules ?? '—');

    // Mesh
    const active = m.mesh?.activeNodes ?? 0;
    const total = m.mesh?.totalNodes ?? 0;
    this.setText('stat-mesh-nodes', total > 0 ? `${active}/${total}` : 'Solo');
    this.setText('stat-mesh-handshakes', total > 0 ? `${active} verified` : '0');

    // Forensics
    this.setText('stat-forensics-procs', m.forensics?.processCount ?? '—');
    this.setText('stat-forensics-ebpf-status', m.forensics?.ebpfActive ? 'ACTIVE' : 'FALLBACK');
    this.setText('stat-forensics-fim-status', m.forensics?.fimActive ? 'ACTIVE' : 'INACTIVE');

    // Honeypot
    this.setText('stat-honeypot-active', m.honeypot?.activeDecoys ?? '—');
    this.setText('stat-honeypot-hits', m.honeypot?.totalHits ?? '0');

    // Kernel Hardening Matrix
    if (m.kernel) {
      this.setText('stat-kernel-aslr', m.kernel.aslr);
      this.setText('stat-kernel-syncookies', m.kernel.syncookies);
      this.setText('stat-kernel-rpfilter', m.kernel.rp_filter);
      this.setStatusColor('stat-kernel-aslr', m.kernel.aslr);
      this.setStatusColor('stat-kernel-syncookies', m.kernel.syncookies);
      this.setStatusColor('stat-kernel-rpfilter', m.kernel.rp_filter);
    }

    // Canary
    this.setText('stat-canary-deployed', m.canary?.deployed ?? '—');
    this.setText('stat-canary-triggered', m.canary?.triggered ?? '0');

    // Audit
    this.setText('stat-audit-chain', m.audit?.chainVerified ? 'VERIFIED' : 'BROKEN');
    this.setStatusColor('stat-audit-chain', m.audit?.chainVerified ? 'VERIFIED' : 'BROKEN');

    // Scanner
    this.setText('stat-scanner-last', m.scanner?.lastScanTime ?? 'NEVER');
    this.setText('stat-scanner-result', m.scanner?.lastScanResult ?? 'PENDING');

    // Protection layer count
    const protectionCount = [true, true, m.firewall?.rules > 0].filter(Boolean).length;
    this.setText('stat-protection-count', `${protectionCount} ACTIVE`);

    // Forensic layer count
    const forensicCount = [m.forensics?.ebpfActive, m.forensics?.fimActive, m.honeypot?.activeDecoys > 0].filter(Boolean).length;
    this.setText('stat-forensic-count', `${forensicCount} ACTIVE`);
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
