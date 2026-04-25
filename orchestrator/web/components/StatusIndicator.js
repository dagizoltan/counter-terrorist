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

    // Simulation for now
    setTimeout(() => {
      this.render(name, 'ONLINE', 'text-green-400');
    }, 1000);
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
