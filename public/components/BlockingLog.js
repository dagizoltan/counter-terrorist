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
    this.loadHistory().then(() => {
        this.connect();
    });
  }

  async loadHistory() {
    try {
      // In a real environment, the session cookie will handle auth.
      // If using Bearer tokens, we'd need to inject them here.
      const res = await fetch('/api/audit?limit=50');
      if (res.ok) {
        const history = await res.json();
        // The API returns most recent first, which is the same order we want in our logs array.
        // We will replace this.logs with history.
        this.logs = history;
        this.render();
      }
    } catch (e) {
      console.error("Failed to load audit history:", e);
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Retrieve token if stored in session/local storage for manual injection
    // For now, we assume the session cookie is enough, but we add the token param
    // as required by the backend in main.ts
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

    // We try to get the token from a meta tag or a known location
    const token = document.querySelector('meta[name="api-token"]')?.content || "";
    if (token) url.searchParams.set('token', token);

    const socket = new WebSocket(url.toString());

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

    const token = document.querySelector('meta[name="api-token"]')?.content || "";
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    input.disabled = true;
    try {
      const res = await fetch('/api/protection/firewall/block', {
        method: 'POST',
        headers: headers,
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
