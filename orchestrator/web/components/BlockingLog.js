/**
 * Custom Element: BlockingLog
 */
class BlockingLog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.logs = [];
  }

  connectedCallback() {
    this.render();
    this.connect();
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Note: This matches the route in main.ts
    // For now we use a dummy simulation if WS fails
    this.addLog({
      type: 'INFO',
      message: 'Event log initialized. Listening for system signals...',
      timestamp: new Date().toLocaleTimeString()
    });
  }

  addLog(entry) {
    this.logs.unshift(entry);
    if (this.logs.length > 50) this.logs.pop();
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .log-container {
          background: #020617;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
          font-size: 0.75rem;
          height: 300px;
          overflow-y: auto;
          padding: 1rem;
        }
        .entry { margin-bottom: 0.25rem; display: flex; gap: 0.5rem; }
        .timestamp { color: #64748b; }
        .type-INFO { color: #38bdf8; }
        .type-WARN { color: #fbbf24; }
        .type-BLOCK { color: #ef4444; font-weight: bold; }
        .message { color: #cbd5e1; }
      </style>
      <div class="log-container">
        ${this.logs.map(log => `
          <div class="entry">
            <span class="timestamp">[${log.timestamp}]</span>
            <span class="type-${log.type}">${log.type}</span>
            <span class="message">${log.message}</span>
          </div>
        `).join('')}
      </div>
    `;
  }
}

customElements.define('blocking-log', BlockingLog);
