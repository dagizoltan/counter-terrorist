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
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.75rem;
          color: #cbd5e1;
        }
        .node { margin-bottom: 0.25rem; }
        .pid { color: #64748b; margin-right: 0.5rem; }
        .comm { color: #38bdf8; font-weight: bold; }
      </style>
      <div class="tree-container">
        ${roots.map(r => renderNode(r)).join('')}
      </div>
    `;
  }
}

customElements.define('process-tree', ProcessTree);
