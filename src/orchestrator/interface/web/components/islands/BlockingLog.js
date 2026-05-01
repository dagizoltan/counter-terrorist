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
      const res = await fetch('/api/audit?limit=50');
      if (res.ok) {
        const history = await res.json();
        this.logs = history;
        this.render();
      }
    } catch (e) {
      console.error("Failed to load audit history:", e);
    }
  }

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
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

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";
    
    if (!csrfToken) {
      console.error("Missing CSRF token. Request aborted for security.");
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-CT-Token': csrfToken
    };

    input.disabled = true;
    try {
      const res = await fetch('/api/infrastructure/system/protection/firewall/block', {
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
        :host { display: block; background: rgba(10, 11, 16, 0.4); border-top: 1px solid rgba(60, 80, 120, 0.2); border-radius: 8px; overflow: hidden; backdrop-filter: blur(12px); }
        .controls {
          padding: 1rem 1.5rem;
          background: rgba(255, 255, 255, 0.02);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          gap: 1rem;
          align-items: center;
        }
        .filter-group {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 9px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
        select {
          background: #0f172a;
          border: 1px solid rgba(60, 80, 120, 0.3);
          color: #e2e8f0;
          padding: 0.3rem 0.6rem;
          border-radius: 4px;
          font-size: 9px;
          text-transform: uppercase;
          outline: none;
        }
        input {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(60, 80, 120, 0.3);
          color: #fff;
          padding: 0.5rem 0.8rem;
          border-radius: 4px;
          font-size: 10px;
          font-family: 'JetBrains Mono', monospace;
          flex-grow: 1;
          outline: none;
        }
        button {
          background: #00d2ff;
          color: #000;
          border: none;
          padding: 0.5rem 1.2rem;
          border-radius: 4px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
        }
        button:hover { background: #00b8e6; transform: translateY(-1px); }
        .log-container {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          height: 350px;
          overflow-y: auto;
        }
        .entry-group { 
          display: grid;
          grid-template-columns: 150px 80px 1fr;
          gap: 1rem;
          padding: 0.6rem 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.02);
          align-items: center;
        }
        .timestamp { color: #64748b; font-size: 9px; }
        .type-label {
          font-size: 8px;
          font-weight: 900;
          padding: 1px 6px;
          text-transform: uppercase;
          text-align: center;
          border-radius: 4px;
        }
        .type-INFO { background: rgba(0, 210, 255, 0.1); color: #00d2ff; }
        .type-WARN { background: rgba(255, 170, 0, 0.1); color: #ffaa00; }
        .type-BLOCK { background: rgba(255, 45, 85, 0.1); color: #ff2d55; }
        .type-CRITICAL { background: #ff2d55; color: #fff; box-shadow: 0 0 10px rgba(255, 45, 85, 0.4); }
        .message { color: #cbd5e1; }
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
