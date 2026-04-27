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
    const token = window.__CONFIG__?.token || '';
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws/events?token=${token}`);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.addLog(data);
      } catch (e) {
        console.error("Error parsing WS message:", e);
      }
    };

    socket.onclose = () => {
      console.warn("WebSocket closed. Attempting reconnect...");
      setTimeout(() => this.connect(), 5000);
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
    };
  }

  addLog(entry) {
    this.logs.unshift(entry);
    if (this.logs.length > 50) this.logs.pop();
    this.render();
  }

  async blockIp(event) {
    event.preventDefault();
    const input = this.shadowRoot.querySelector('#ip-input');
    const ip = input.value;
    if (!ip) return;

    input.disabled = true;
    try {
      const res = await fetch('/api/protection/firewall/block', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (window.__CONFIG__?.token || '')
        },
        body: JSON.stringify({ ip })
      });
      if (res.ok) input.value = '';
    } finally {
      input.disabled = false;
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .controls {
          padding: 1rem;
          background: #0f172a;
          border-bottom: 1px solid #1e293b;
          display: flex;
          gap: 0.5rem;
        }
        input {
          background: #1e293b;
          border: 1px solid #334155;
          color: white;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-size: 0.875rem;
          flex-grow: 1;
        }
        button {
          background: #ef4444;
          color: white;
          border: none;
          padding: 0.25rem 0.75rem;
          border-radius: 4px;
          font-size: 0.875rem;
          font-weight: bold;
          cursor: pointer;
        }
        button:hover { background: #dc2626; }
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
        .type-CRITICAL { color: #f43f5e; font-weight: bold; text-decoration: underline; }
        .type-DRIFT_PORT { color: #a855f7; }
        .type-DRIFT_PROCESS { color: #ec4899; }
        .message { color: #cbd5e1; }
        .details { color: #94a3b8; font-size: 0.7rem; margin-left: 1rem; }
      </style>
      <form class="controls" id="block-form">
        <input type="text" id="ip-input" placeholder="Enter IP to block..." />
        <button type="submit">BLOCK IP</button>
      </form>
      <div class="log-container">
        ${this.logs.map(log => `
          <div class="entry-group">
            <div class="entry">
              <span class="timestamp">[${log.timestamp}]</span>
              <span class="type-${log.type}">${log.type}</span>
              <span class="message">${log.message}</span>
            </div>
            ${log.data ? `<div class="details">${typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    this.shadowRoot.querySelector('#block-form').addEventListener('submit', (e) => this.blockIp(e));
  }
}

customElements.define('blocking-log', BlockingLog);
