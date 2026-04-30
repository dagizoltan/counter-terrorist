/**
 * Custom Element: ProcessTree
 */
class ProcessTree extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.processes = [];
  }

  connectedCallback() {
    this.refresh();
  }

  async refresh() {
    const token = document.querySelector('meta[name="api-token"]')?.content || "";
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const res = await fetch('/api/processes/tree', { headers });
      if (res.ok) {
        this.processes = await res.json();
        this.render();
      }
    } catch (e) {
      console.error("Failed to fetch process tree:", e);
    }
  }

  render() {
    // Build tree structure
    const roots = this.processes.filter(p => !this.processes.find(parent => parent.pid === p.ppid));

    const renderNode = (node, depth = 0) => {
      const children = this.processes.filter(p => p.ppid === node.pid);
      return `
        <div class="node" style="margin-left: ${depth * 1.5}rem">
          <span class="pid">[${node.pid}]</span>
          <span class="comm">${node.comm}</span>
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
        .node { 
          margin-bottom: 0.5rem; 
          padding-left: 1rem;
          border-left: 1px solid rgba(255,255,255,0.05);
        }
        .pid { color: #475569; margin-right: 0.75rem; font-size: 9px; }
        .comm { color: #fff; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
      </style>
      <div class="tree-container">
        ${roots.map(r => renderNode(r)).join('')}
      </div>
    `;
  }
}

customElements.define('process-tree', ProcessTree);
