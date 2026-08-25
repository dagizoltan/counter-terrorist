/**
 * ProcessTree Island
 * High-density hierarchical visualization of kernel processes.
 */
import { unwrap } from "./api.js";
class ProcessTree extends HTMLElement {
  constructor() {
    super();
    this.processes = [];
    this.isScanning = false;
  }

  connectedCallback() {
    this.refresh();
  }

  async update() {
     await this.refresh();
  }

  async refresh() {
    this.isScanning = true;
    this.render();

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/processes/tree', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        this.processes = await unwrap(res);
      }
    } catch (e) {
      console.error("[PROCESS-TREE] Sync failed", e);
    } finally {
      this.isScanning = false;
      this.render();
    }
  }

  render() {
    if (this.isScanning && this.processes.length === 0) {
      this.innerHTML = `
        <div class="flex flex-col items-center justify-center p-6 gap-4">
           <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full"></div>
           <span class="eyebrow" data-tone="primary">Infiltrating_Process_Namespace...</span>
        </div>
      `;
      return;
    }

    if (!this.processes.length) {
      this.innerHTML = `
        <div class="p-6 text-center border border-dashed border-white/5 opacity-30 rounded">
           <span class="eyebrow">No_Execution_Lineage_Data_In_Buffer</span>
        </div>
      `;
      return;
    }

    const pids = new Set(this.processes.map(p => p.pid));
    const roots = this.processes.filter(p => p.ppid === 0 || !pids.has(p.ppid));
    roots.sort((a, b) => a.pid - b.pid);

    this.innerHTML = `
      <div class="space-y-0.5">
        ${roots.map(r => this.renderNode(r, 0)).join('')}
      </div>
    `;
  }

  renderNode(node, depth) {
    const children = this.processes.filter(p => p.ppid === node.pid);
    children.sort((a, b) => a.pid - b.pid);

    const isGhost = node.isGhost || false; 
    const isProtected = node.comm.includes('ghost_') || node.comm.includes('cts_');
    
    const theme = isGhost ? 'danger' : (isProtected ? 'primary' : 'slate');
    
    const paddingLeft = depth * 32;
    const lineOpacity = Math.max(0.05, 0.3 - depth * 0.05);

    return `
      <div class="flex flex-col">
        <div class="flex items-center group py-2 px-4 hover:bg-white/[0.03] cursor-default border-l border-white/[0.05]" 
             style="margin-left: ${paddingLeft}px; border-left-color: rgba(255,255,255,${lineOpacity})">
           <div class="flex items-center gap-4 w-full">
              <span class="mono-xs font-black opacity-20 w-16 tabular-nums">[${node.pid}]</span>
              <div class="flex items-center gap-4 flex-grow">
                 <span class="mono-sm font-black uppercase tracking-tight ${isGhost ? 'text-danger' : (isProtected ? 'text-primary' : 'text-white')}">
                    ${node.comm}
                 </span>
                 ${isGhost ? '<span class="status-pill error">UNLINKED_GHOST</span>' : ''}
                 ${isProtected ? '<span class="status-pill active">SOVEREIGN</span>' : ''}
              </div>
              <div class="opacity-0 flex items-center gap-4">
                 <span class="eyebrow">PPID: ${node.ppid}</span>
                 <button class="t-btn danger p-1 text-[8px] h-6 px-3" onclick="const csrf = document.querySelector('meta[name=\'csrf-token\']')?.content; confirm('Execute SIGKILL on PID ${node.pid}?') && fetch('/api/processes/kill/${node.pid}', {method:'POST', headers:{'X-CT-Token':csrf}}).then(() => location.reload())">Terminate</button>
              </div>
           </div>
        </div>
        ${children.map(c => this.renderNode(c, depth + 1)).join('')}
      </div>
    `;
  }
}

customElements.define('process-tree', ProcessTree);
