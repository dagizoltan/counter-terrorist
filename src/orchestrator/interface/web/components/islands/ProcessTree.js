/**
 * Custom Element: ProcessTree
 * Renders a hierarchical view of system processes.
 */
class ProcessTree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.processes = [];
    this.loading = false;
  }

  connectedCallback() {
    this.refresh();
  }

  async refresh() {
    this.loading = true;
    this.render();

    const token = document.querySelector('meta[name="api-token"]')?.content || "";
    const headers = {};
    if (token && token !== "") {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const res = await fetch('/api/processes/tree', { headers });
      if (res.ok) {
        this.processes = await res.json();
        console.log(`[PROCESS-TREE] Loaded ${this.processes.length} processes`);
      } else {
        console.error(`[PROCESS-TREE] Failed to fetch: ${res.status}`);
      }
    } catch (e) {
      console.error("[PROCESS-TREE] Fetch error:", e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    if (this.loading) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #475569; }
          .loading { padding: 2rem; text-align: center; letter-spacing: 0.2em; }
        </style>
        <div class="loading">SCANNING_KERNEL_NAMESPACE...</div>
      `;
      return;
    }

    if (this.processes.length === 0) {
      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #475569; }
          .empty { padding: 2rem; text-align: center; border: 1px dashed rgba(255,255,255,0.05); }
        </style>
        <div class="empty">NO_PROCESS_DATA_AVAILABLE</div>
      `;
      return;
    }

    // Build tree structure
    // A root is a process whose ppid is not present in our current process list
    const pids = new Set(this.processes.map(p => p.pid));
    const roots = this.processes.filter(p => p.ppid === 0 || !pids.has(p.ppid));

    // Sort roots by PID
    roots.sort((a, b) => a.pid - b.pid);

    const renderNode = (node, depth = 0) => {
      const children = this.processes.filter(p => p.ppid === node.pid);
      children.sort((a, b) => a.pid - b.pid);

      return `
        <div class="node-container">
            <div class="node" style="margin-left: ${depth * 1}rem">
              <span class="pid">[${node.pid}]</span>
              <span class="comm">${node.comm}</span>
            </div>
            ${children.map(c => renderNode(c, depth + 1)).join('')}
        </div>
      `;
    };

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          color: #94a3b8;
        }
        .tree-container {
            padding: 0.5rem;
        }
        .node-container {
            display: flex;
            flex-direction: column;
        }
        .node { 
          display: flex;
          align-items: center;
          height: 22px;
          padding-left: 12px;
          border-left: 1px solid rgba(60, 80, 120, 0.2);
          transition: all 0.2s;
          white-space: nowrap;
          cursor: default;
        }
        .node:hover {
            background: rgba(0, 210, 255, 0.05);
            color: #fff;
        }
        .pid { 
            color: #00d2ff; 
            margin-right: 12px; 
            font-size: 8px; 
            font-weight: 800;
            width: 45px;
            display: inline-block;
            opacity: 0.7;
        }
        .comm { 
            color: #e2e8f0; 
            font-weight: 500; 
            text-transform: uppercase; 
            letter-spacing: 0.05em; 
        }
      </style>
      <div class="tree-container">
        ${roots.map(r => renderNode(r)).join('')}
      </div>
    `;
  }
}

if (!customElements.get('process-tree')) {
    customElements.define('process-tree', ProcessTree);
}
