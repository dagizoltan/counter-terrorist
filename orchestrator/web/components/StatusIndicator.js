/**
 * Custom Element: StatusIndicator
 */
class StatusIndicator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    const name = this.getAttribute('name') || 'Unknown Agent';
    this.render(name, 'Initializing...', 'text-slate-400');
    this.updateStatus();
    // Refresh every 30 seconds
    this.interval = setInterval(() => this.updateStatus(), 30000);
  }

  disconnectedCallback() {
    if (this.interval) clearInterval(this.interval);
  }

  async updateStatus() {
    const name = this.getAttribute('name');
    const token = window.__CONFIG__?.token;
    if (!token) return;

    try {
      const res = await fetch('/api/status', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        const status = await res.json();
        let isOnline = false;

        // Map UI names to dependencies
        if (name === "Network Sensor") isOnline = status.dependencies.ss;
        else if (name === "Persistence Monitor") isOnline = status.dependencies.cargo;
        else if (name === "Active Blocker") isOnline = status.dependencies.ufw;

        this.render(name, isOnline ? 'ONLINE' : 'OFFLINE', isOnline ? 'text-green-400' : 'text-red-400');
      } else {
        this.render(name, 'ERROR', 'text-red-500');
      }
    } catch (e) {
      console.error("Failed to fetch status:", e);
      this.render(name, 'UNREACHABLE', 'text-yellow-500');
    }
  }

  render(name, status, colorClass) {
    this.shadowRoot.innerHTML = `
      <style>
        .container {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-bottom: 1px solid #334155;
          font-size: 0.875rem;
        }
        .text-slate-400 { color: #94a3b8; }
        .text-green-400 { color: #4ade80; font-weight: bold; }
        .name { color: #e2e8f0; }
      </style>
      <div class="container">
        <span class="name">${name}</span>
        <span class="${colorClass}">${status}</span>
      </div>
    `;
  }
}

customElements.define('status-indicator', StatusIndicator);
