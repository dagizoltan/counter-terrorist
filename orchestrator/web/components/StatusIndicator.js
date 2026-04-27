/**
 * Custom Element: StatusIndicator
 */
class StatusIndicator extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  async connectedCallback() {
    const name = this.getAttribute('name') || 'Unknown Agent';
    const endpoint = this.getAttribute('endpoint');
    this.render(name, 'Initializing...', 'text-slate-400');

    if (endpoint) {
      try {
        const token = document.querySelector('meta[name="api-token"]')?.content;
        const res = await fetch(endpoint, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          // Heuristic to determine if "healthy"
          const isHealthy = data.success !== false && data.active !== false && !data.error;
          this.render(name, isHealthy ? 'ONLINE' : 'ERROR', isHealthy ? 'text-green-400' : 'text-red-400');
        } else {
          this.render(name, 'OFFLINE', 'text-slate-500');
        }
      } catch (e) {
        this.render(name, 'ERROR', 'text-red-400');
      }
    } else {
      // Simulation fallback if no endpoint
      setTimeout(() => {
        this.render(name, 'ONLINE', 'text-green-400');
      }, 1000);
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
        .text-slate-500 { color: #64748b; }
        .text-green-400 { color: #4ade80; font-weight: bold; }
        .text-red-400 { color: #f87171; font-weight: bold; }
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
