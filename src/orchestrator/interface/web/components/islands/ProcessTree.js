/**
 * ProcessTree Island
 * High-density hierarchical visualization of kernel processes.
 */
import { unwrap, apiSend } from "./api.js";
import { bindActions } from "./actions.js";
class ProcessTree extends HTMLElement {
  constructor() {
    super();
    this.processes = [];
    this.isScanning = false;
  }

  get canTerminate() {
    return this.getAttribute("role-name") === "admin";
  }

  connectedCallback() {
    bindActions(this, { terminate: (el) => this.terminate(el.dataset.pid, el.dataset.comm) });
    this.refresh();
  }

  /**
   * SIGKILL one process, after forensics.
   *
   * The button that used to sit here posted to /api/processes/kill/:pid, which
   * no route served, from an inline onclick the CSP refused — dead twice over,
   * inside a wrapper that was invisible anyway. The route exists now and is
   * admin-only; firewall.killProcess() dumps process forensics and writes an
   * audit event before signalling.
   */
  async terminate(pid, comm) {
    if (!pid || this.busy === pid) return;
    if (!globalThis.confirm(`Execute SIGKILL on PID ${pid} (${comm || "unknown"})?\n\nForensics are captured first. This cannot be undone.`)) return;

    this.busy = pid;
    this.render();
    try {
      await apiSend(`/api/processes/kill/${encodeURIComponent(pid)}`, "POST");
      this.error = null;
    } catch (e) {
      this.error = `Termination failed for PID ${pid}: ${e.message}`;
    } finally {
      this.busy = null;
      await this.refresh();
    }
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
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    const banner = this.error
      ? `<div class="error-box" role="alert"><span class="danger-dot" aria-hidden="true"></span>${esc(this.error)}</div>`
      : "";

    if (this.isScanning && this.processes.length === 0) {
      this.innerHTML = banner + `
        <div class="flex flex-col items-center justify-center p-6 gap-4">
           <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full"></div>
           <span class="eyebrow" data-tone="primary">Infiltrating_Process_Namespace...</span>
        </div>
      `;
      return;
    }

    if (!this.processes.length) {
      this.innerHTML = banner + `
        <div class="p-6 text-center border border-dashed border-white/5 opacity-30 rounded">
           <span class="eyebrow">No_Execution_Lineage_Data_In_Buffer</span>
        </div>
      `;
      return;
    }

    const pids = new Set(this.processes.map(p => p.pid));
    const roots = this.processes.filter(p => p.ppid === 0 || !pids.has(p.ppid));
    roots.sort((a, b) => a.pid - b.pid);

    this.innerHTML = banner + `
      <div class="space-y-0.5">
        ${roots.map(r => this.renderNode(r, 0)).join('')}
      </div>
    `;
  }

  /**
   * One process row.
   *
   * A "Terminate" button used to sit next to PPID. It was dead three ways: its
   * wrapper carried opacity-0 with no hover rule to reveal it, its inline
   * onclick was refused by the CSP, and it posted to /api/processes/kill/:pid,
   * which no route serves. The capability exists — firewall.killProcess dumps
   * process forensics and writes an audit event before signalling — but
   * exposing arbitrary PID termination over HTTP is a decision for the
   * operator, not a side effect of a UI fix. The button is gone rather than
   * pretending to work.
   */
  renderNode(node, depth) {
    // node.comm is whatever the process called itself. A process named
    // `<img src=x>` used to be written into the tree verbatim.
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
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
              <span class="mono-xs font-black opacity-20 w-16 tabular-nums">[${esc(node.pid)}]</span>
              <div class="flex items-center gap-4 flex-grow">
                 <span class="mono-sm font-black uppercase tracking-tight ${isGhost ? 'text-danger' : (isProtected ? 'text-primary' : 'text-white')}">
                    ${esc(node.comm)}
                 </span>
                 ${isGhost ? '<span class="status-pill error">UNLINKED_GHOST</span>' : ''}
                 ${isProtected ? '<span class="status-pill active">SOVEREIGN</span>' : ''}
              </div>
              <span class="eyebrow">PPID: ${esc(node.ppid)}</span>
              ${this.canTerminate && !isProtected ? `
                <button type="button" class="btn btn--sm danger opacity-0 group-hover:opacity-100 transition-opacity"
                        data-action="terminate" data-pid="${esc(node.pid)}" data-comm="${esc(node.comm)}"
                        ${this.busy === String(node.pid) ? "disabled" : ""}>
                  ${this.busy === String(node.pid) ? "…" : "Terminate"}
                </button>` : ""}
           </div>
        </div>
        ${children.map(c => this.renderNode(c, depth + 1)).join('')}
      </div>
    `;
  }
}

customElements.define('process-tree', ProcessTree);
