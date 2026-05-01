/**
 * Custom Element: BlockingLog
 * Enhanced with historical log fetching and real-time streaming.
 */
class BlockingLog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.logs = [];
    this.filter = 'ALL';
    this.cursor = null;
    this.loading = false;
    this.hasMore = true;
  }

  connectedCallback() {
    this.render();
    this.loadHistory().then(() => {
        this.connect();
    });
  }

  async loadHistory(append = false) {
    if (this.loading) return;
    this.loading = true;
    this.render();

    try {
      const url = this.cursor 
        ? `/api/audit?limit=50&cursor=${this.cursor}`
        : '/api/audit?limit=50';
      
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        
        // Handle both old array response and new object response
        const newLogs = Array.isArray(data) ? data : (data.items || []);
        this.cursor = data.cursor || null;
        this.hasMore = !!this.cursor && newLogs.length > 0;

        if (append) {
          this.logs = [...this.logs, ...newLogs];
        } else {
          this.logs = newLogs;
        }
      }
    } catch (e) {
      console.error("Failed to load audit history:", e);
    } finally {
      this.loading = false;
      this.render();
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
    // Only add if it matches filter or if it's new real-time data
    this.logs.unshift(entry);
    // Keep a reasonable number of events in the "active" view
    if (this.logs.length > 500) this.logs.pop();
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
      : this.logs.filter(log => {
          if (this.filter === 'WARN') return log.type === 'WARN' || log.type === 'CRITICAL' || log.type === 'THREAT';
          if (this.filter === 'CRITICAL') return log.type === 'CRITICAL' || log.type === 'THREAT';
          return log.type === this.filter;
      });

    this.shadowRoot.innerHTML = `
      <style>
        :host { 
          display: flex; 
          flex-direction: column; 
          height: 100%; 
          background: transparent; 
          overflow: hidden;
          font-family: 'Outfit', sans-serif;
        }
        .controls {
          padding: 1.25rem;
          background: rgba(2, 6, 23, 0.4);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 1rem;
          backdrop-filter: blur(10px);
        }
        .filter-group {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .label {
          font-size: 9px;
          font-weight: 900;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.3em;
        }
        select {
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #e2e8f0;
          padding: 0.3rem 0.6rem;
          border-radius: 6px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          outline: none;
          cursor: pointer;
        }
        .input-group {
          display: flex;
          gap: 0.5rem;
        }
        input {
          background: rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          color: #fff;
          padding: 0.6rem 0.8rem;
          border-radius: 8px;
          font-size: 11px;
          font-family: 'JetBrains Mono', monospace;
          flex-grow: 1;
          outline: none;
          transition: border 0.2s;
        }
        input:focus { border-color: rgba(14, 165, 233, 0.4); }
        .btn-block {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.2);
          padding: 0.6rem 1rem;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.1em;
        }
        .btn-block:hover { background: #ef4444; color: #fff; }
        
        .log-container {
          flex-grow: 1;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
          display: flex;
          flex-direction: column;
        }
        .log-container::-webkit-scrollbar { width: 4px; }
        .log-container::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); }

        .entry-group { 
          padding: 1rem 1.25rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
          cursor: pointer;
          transition: background 0.2s;
          position: relative;
        }
        .entry-group:hover { background: rgba(255, 255, 255, 0.03); }
        
        .entry-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }
        .timestamp { color: #475569; font-size: 9px; font-weight: 700; }
        .type-label {
          font-size: 8px;
          font-weight: 900;
          padding: 2px 6px;
          text-transform: uppercase;
          border-radius: 4px;
        }
        .type-INFO { background: rgba(14, 165, 233, 0.1); color: #0ea5e9; }
        .type-WARN { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
        .type-BLOCK { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .type-THREAT { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); }
        .type-CRITICAL { background: #ef4444; color: #fff; }
        
        .message { 
          color: #cbd5e1; 
          line-height: 1.5; 
          word-break: break-all;
          font-weight: 500;
        }
        
        .details {
          max-height: 0;
          overflow: hidden;
          transition: all 0.3s ease-out;
          background: rgba(0, 0, 0, 0.5);
          border-radius: 8px;
          margin-top: 0;
          font-size: 9px;
        }
        .entry-group.expanded .details {
          max-height: 500px;
          margin-top: 1rem;
          padding: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow-x: auto;
        }
        pre { margin: 0; white-space: pre-wrap; color: #60a5fa; line-height: 1.4; }
        
        .load-more {
          padding: 2rem;
          text-align: center;
        }
        .btn-load {
          background: transparent;
          color: #64748b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.2em;
        }
        .btn-load:hover { 
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          border-color: rgba(255, 255, 255, 0.2);
        }
        .btn-load:disabled { opacity: 0.5; cursor: not-allowed; }

        .empty-state {
          padding: 4rem 2rem;
          text-align: center;
          color: #475569;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2em;
        }
        
        .loading-spinner {
          display: inline-block;
          width: 12px;
          height: 12px;
          border: 2px solid rgba(14, 165, 233, 0.3);
          border-radius: 50%;
          border-top-color: #0ea5e9;
          animation: spin 1s linear infinite;
          margin-right: 8px;
          vertical-align: middle;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      </style>
      <div class="controls">
        <div class="filter-group">
            <span class="label">Signal_Filter</span>
            <select id="severity-filter">
                <option value="ALL" ${this.filter === 'ALL' ? 'selected' : ''}>ALL_SIGNALS</option>
                <option value="INFO" ${this.filter === 'INFO' ? 'selected' : ''}>INFO_FEED</option>
                <option value="WARN" ${this.filter === 'WARN' ? 'selected' : ''}>WARNINGS+</option>
                <option value="CRITICAL" ${this.filter === 'CRITICAL' ? 'selected' : ''}>CRITICAL_ONLY</option>
                <option value="BLOCK" ${this.filter === 'BLOCK' ? 'selected' : ''}>BLOCK_EVENTS</option>
                <option value="THREAT" ${this.filter === 'THREAT' ? 'selected' : ''}>THREAT_INTEL</option>
            </select>
        </div>
        <form id="block-form" class="input-group">
            <input type="text" id="ip-input" placeholder="ENFORCEMENT_IP" spellcheck="false" />
            <button type="submit" class="btn-block">BLOCK</button>
        </form>
      </div>
      <div class="log-container">
        ${filteredLogs.length === 0 && !this.loading ? `
          <div class="empty-state">No signals detected in current buffer</div>
        ` : ''}
        ${filteredLogs.map((log, index) => `
          <div class="entry-group" data-index="${index}">
            <div class="entry-header">
              <span class="timestamp">${this.formatTimestamp(log.timestamp)}</span>
              <span class="type-label type-${log.type}">${log.type}</span>
            </div>
            <div class="message">${this.escapeHtml(log.message)}</div>
            <div class="details">
               <pre>${this.escapeHtml(JSON.stringify(log.data || { info: "No additional metadata" }, null, 2))}</pre>
            </div>
          </div>
        `).join('')}
        
        ${this.hasMore ? `
          <div class="load-more">
            <button id="btn-load-more" class="btn-load" ${this.loading ? 'disabled' : ''}>
              ${this.loading ? '<span class="loading-spinner"></span>' : ''}
              Load_Full_History
            </button>
          </div>
        ` : ''}
        
        ${this.loading && filteredLogs.length === 0 ? `
           <div class="empty-state">
             <span class="loading-spinner"></span>
             Hydrating_Log_Chain...
           </div>
        ` : ''}
      </div>
    `;
    
    this.shadowRoot.querySelector('#block-form').addEventListener('submit', (e) => this.blockIp(e));
    this.shadowRoot.querySelector('#severity-filter').addEventListener('change', (e) => {
        this.filter = e.target.value;
        this.render();
    });
    
    const loadMoreBtn = this.shadowRoot.querySelector('#btn-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', () => this.loadHistory(true));
    }

    this.shadowRoot.querySelectorAll('.entry-group').forEach(el => {
      el.addEventListener('click', () => {
        el.classList.toggle('expanded');
      });
    });
  }

  formatTimestamp(ts) {
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return 'UNKNOWN';
      return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'INVALID';
    }
  }

  escapeHtml(text) {
    if (typeof text !== 'string') return String(text);
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

customElements.define('blocking-log', BlockingLog);
