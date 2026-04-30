/**
 * Custom Element: BlockingLog
 */
class BlockingLog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.logs = [];
    this.filter = 'ALL';
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
    // Use session cookie for WebSocket authentication
    const url = new URL(`${protocol}//${window.location.host}/api/ws/events`);

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
    if (this.logs.length > 100) this.logs.pop();
    this.render();
  }

  async blockIp(event) {
    event.preventDefault();
    const input = this.shadowRoot.querySelector('#ip-input');
    const ip = input.value;
    if (!ip) return;

    const token = document.querySelector('meta[name="api-token"]')?.content || "";
    const headers = {
      'Content-Type': 'application/json',
      'X-CT-Token': token
    };
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
    const filteredLogs = this.filter === 'ALL'
      ? this.logs
      : this.logs.filter(log => log.type === this.filter || (this.filter === 'WARN' && log.type === 'CRITICAL'));

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; background: #000; border-top: 1px solid rgba(255,255,255,0.05); }
        .controls {
          padding: 1.5rem 2rem;
          background: rgba(255,255,255,0.02);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          display: flex;
          gap: 1.5rem;
          align-items: center;
        }
        .filter-group {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 1rem;
          font-size: 10px;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        select {
          background: #000;
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 0.4rem 0.8rem;
          border-radius: 0;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          outline: none;
        }
        input {
          background: #000;
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 0.6rem 1rem;
          border-radius: 0;
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
          flex-grow: 1;
          outline: none;
        }
        input:focus { border-color: rgba(255,255,255,0.3); }
        button {
          background: #fff;
          color: #000;
          border: none;
          padding: 0.6rem 1.5rem;
          border-radius: 0;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.2s;
        }
        button:hover { background: #e2e8f0; }
        .log-container {
          background: #000;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          height: 400px;
          overflow-y: auto;
          padding: 0;
        }
        .log-container::-webkit-scrollbar { width: 4px; }
        .log-container::-webkit-scrollbar-track { background: transparent; }
        .log-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }

        .entry-group { 
          display: grid;
          grid-template-columns: 180px 100px 1fr;
          gap: 1rem;
          padding: 0.75rem 2rem;
          border-bottom: 1px solid rgba(255,255,255,0.02);
          align-items: center;
          transition: background 0.1s;
        }
        .entry-group:hover { background: rgba(255,255,255,0.01); }
        .timestamp { color: #475569; font-size: 10px; }
        .type-label {
          font-size: 9px;
          font-weight: 900;
          padding: 2px 6px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          text-align: center;
          border-radius: 0;
          width: fit-content;
        }
        .type-INFO { background: rgba(56, 189, 248, 0.1); color: #38bdf8; }
        .type-WARN { background: rgba(251, 191, 36, 0.1); color: #fbbf24; }
        .type-BLOCK { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .type-CRITICAL { background: #ef4444; color: #fff; }
        .type-DRIFT_PORT { background: rgba(168, 85, 247, 0.1); color: #a855f7; }
        .type-DRIFT_PROCESS { background: rgba(236, 72, 153, 0.1); color: #ec4899; }
        .message { color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .details { 
           grid-column: 3;
           color: #475569; 
           font-size: 10px; 
           margin-top: -0.25rem;
           margin-bottom: 0.5rem;
        }
      </style>
      <div class="controls">
        <form id="block-form" style="display:flex; flex-grow:1; gap: 1rem;">
            <input type="text" id="ip-input" placeholder="ENFORCEMENT_IP_ADDRESS" />
            <button type="submit">COMMIT_BLOCK</button>
        </form>
        <div class="filter-group">
            <span>Filter_Level:</span>
            <select id="severity-filter">
                <option value="ALL" ${this.filter === 'ALL' ? 'selected' : ''}>ALL_EVENTS</option>
                <option value="INFO" ${this.filter === 'INFO' ? 'selected' : ''}>INFO_ONLY</option>
                <option value="WARN" ${this.filter === 'WARN' ? 'selected' : ''}>WARNINGS+</option>
                <option value="CRITICAL" ${this.filter === 'CRITICAL' ? 'selected' : ''}>CRITICAL_ONLY</option>
                <option value="BLOCK" ${this.filter === 'BLOCK' ? 'selected' : ''}>BLOCK_ACTIONS</option>
            </select>
        </div>
      </div>
      <div class="log-container">
        ${filteredLogs.map(log => `
          <div class="entry-group">
            <span class="timestamp">${log.timestamp}</span>
            <span class="type-label type-${log.type}">${log.type}</span>
            <span class="message">${log.message}</span>
            ${log.data ? `<div class="details">${typeof log.data === 'string' ? log.data : JSON.stringify(log.data)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    `;
    this.shadowRoot.querySelector('#block-form').addEventListener('submit', (e) => this.blockIp(e));
    this.shadowRoot.querySelector('#severity-filter').addEventListener('change', (e) => {
        this.filter = e.target.value;
        this.render();
    });
  }
}

customElements.define('blocking-log', BlockingLog);
