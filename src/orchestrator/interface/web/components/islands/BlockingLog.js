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
        :host { display: flex; flex-direction: column; height: 100%; background: transparent; overflow: hidden; }
        .controls {
          padding: 1rem;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .filter-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 8px;
          font-weight: 900;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.2em;
        }
        select {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #e2e8f0;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
          font-size: 8px;
          text-transform: uppercase;
          outline: none;
        }
        input {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #fff;
          padding: 0.5rem;
          border-radius: 8px;
          font-size: 10px;
          font-family: 'JetBrains Mono', monospace;
          width: 100%;
          outline: none;
        }
        button {
          background: rgba(14, 165, 233, 0.1);
          color: #0ea5e9;
          border: 1px solid rgba(14, 165, 233, 0.2);
          padding: 0.5rem;
          border-radius: 8px;
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.1em;
        }
        button:hover { background: #0ea5e9; color: #fff; }
        .log-container {
          flex-grow: 1;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
        }
        .log-container::-webkit-scrollbar { width: 4px; }
        .log-container::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); }

        .entry-group { 
          padding: 0.75rem 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.02);
          cursor: pointer;
          transition: background 0.2s;
        }
        .entry-group:hover { background: rgba(255, 255, 255, 0.02); }
        
        .entry-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.25rem;
        }
        .timestamp { color: #475569; font-size: 8px; font-weight: 700; }
        .type-label {
          font-size: 7px;
          font-weight: 900;
          padding: 1px 4px;
          text-transform: uppercase;
          border-radius: 3px;
        }
        .type-INFO { background: rgba(14, 165, 233, 0.1); color: #0ea5e9; }
        .type-WARN { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .type-BLOCK { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .type-CRITICAL { background: #ef4444; color: #fff; }
        
        .message { color: #94a3b8; line-height: 1.4; word-break: break-all; }
        
        .details {
          max-height: 0;
          overflow: hidden;
          transition: all 0.3s ease-out;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
          margin-top: 0;
          font-size: 8px;
        }
        .entry-group.expanded .details {
          max-height: 300px;
          margin-top: 0.75rem;
          padding: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow-x: auto;
        }
        pre { margin: 0; white-space: pre-wrap; color: #60a5fa; }
      </style>
      <div class="controls">
        <div class="filter-group">
            <span>Filter_Level</span>
            <select id="severity-filter">
                <option value="ALL" ${this.filter === 'ALL' ? 'selected' : ''}>ALL_EVENTS</option>
                <option value="INFO" ${this.filter === 'INFO' ? 'selected' : ''}>INFO_ONLY</option>
                <option value="WARN" ${this.filter === 'WARN' ? 'selected' : ''}>WARNINGS+</option>
                <option value="CRITICAL" ${this.filter === 'CRITICAL' ? 'selected' : ''}>CRITICAL_ONLY</option>
                <option value="BLOCK" ${this.filter === 'BLOCK' ? 'selected' : ''}>BLOCK_ACTIONS</option>
            </select>
        </div>
        <form id="block-form" style="display:flex; gap: 0.5rem;">
            <input type="text" id="ip-input" placeholder="ENFORCEMENT_IP" />
            <button type="submit">BLOCK</button>
        </form>
      </div>
      <div class="log-container">
        ${filteredLogs.map((log, index) => `
          <div class="entry-group" data-index="${index}">
            <div class="entry-header">
              <span class="timestamp">${new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span class="type-label type-${log.type}">${log.type}</span>
            </div>
            <div class="message">${log.message}</div>
            <div class="details">
               <pre>${JSON.stringify(log.data || { info: "No additional metadata" }, null, 2)}</pre>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    this.shadowRoot.querySelector('#block-form').addEventListener('submit', (e) => this.blockIp(e));
    this.shadowRoot.querySelector('#severity-filter').addEventListener('change', (e) => {
        this.filter = e.target.value;
        this.render();
    });
    this.shadowRoot.querySelectorAll('.entry-group').forEach(el => {
      el.addEventListener('click', () => {
        el.classList.toggle('expanded');
      });
    });
  }
}

customElements.define('blocking-log', BlockingLog);
