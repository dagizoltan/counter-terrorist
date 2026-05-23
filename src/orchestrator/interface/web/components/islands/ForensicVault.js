/**
 * Custom Element: ForensicVault
 * Displays and allows retrieval of forensic artifacts from the secure evidence directory.
 */
class ForensicVault extends HTMLElement {
  constructor() {
    super();
    this.artifacts = [];
    this.loading = false;
    this.bundling = false;
  }

  connectedCallback() {
    this.render();
    this.fetchArtifacts();
  }

  async fetchArtifacts() {
    if (this.loading) return;
    this.loading = true;
    this.render();

    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/reports/forensics/list', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        this.artifacts = await res.json();
      }
    } catch (e) {
      console.error('Failed to fetch forensic artifacts:', e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async generateBundle() {
    if (this.bundling) return;
    this.bundling = true;
    this.render();

    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const res = await fetch('/api/reports/forensics/bundle', {
            method: 'POST',
            headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
        });
        if (res.ok) {
            await this.fetchArtifacts();
        }
    } catch (e) {
        console.error('Failed to generate bundle:', e);
    } finally {
        this.bundling = false;
        this.render();
    }
  }

  render() {
    this.innerHTML = `
      <div class="t-panel glass-panel p-0 bg-black/40 overflow-hidden shadow-2xl flex flex-col border-t-2 border-primary/10">
        <header class="p-8 border-b border-white/5 bg-black/60 flex justify-between items-center backdrop-blur-xl sticky top-0 z-20">
           <div class="flex flex-col gap-1">
              <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">Forensic_Vault</span>
              <span class="mono text-[7px] text-slate-600 uppercase italic">Immutable Evidence Chain // Root-Protected Storage</span>
           </div>
           <div class="flex gap-4">
              <button onclick="this.closest('forensic-vault').generateBundle()" class="t-btn !py-2 !px-6 ${this.bundling ? 'opacity-50 pointer-events-none' : ''}">
                 <svg class="${this.bundling ? 'animate-spin' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                 <span class="mono text-[9px] font-black uppercase tracking-widest ml-2">Create_Signed_Bundle</span>
              </button>
              <button onclick="this.closest('forensic-vault').fetchArtifacts()" class="t-btn !py-2 !px-6 ${this.loading ? 'opacity-50 pointer-events-none' : ''}">
                 <svg class="${this.loading ? 'animate-spin' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                 <span class="mono text-[9px] font-black uppercase tracking-widest ml-2">Refresh_Ledger</span>
              </button>
           </div>
        </header>

        <div class="flex-grow overflow-y-auto custom-scrollbar max-h-[600px]">
           <table class="w-full text-left border-collapse table-fixed">
              <thead class="sticky top-0 bg-black/40 backdrop-blur-md z-10 border-b border-white/5 text-[8px]">
                 <tr>
                    <th class="p-4 w-[40%] mono text-slate-500 font-black uppercase">Artifact_Identifier</th>
                    <th class="p-4 w-[15%] mono text-slate-500 font-black uppercase">Type</th>
                    <th class="p-4 w-[15%] mono text-slate-500 font-black uppercase">Size</th>
                    <th class="p-4 w-[20%] mono text-slate-500 font-black uppercase">Committed_At</th>
                    <th class="p-4 w-[10%] mono text-slate-500 font-black uppercase text-right">Actions</th>
                 </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                 ${this.artifacts.length === 0 && !this.loading ? `
                    <tr><td colspan="5" class="p-12 text-center opacity-20 mono-xs font-black uppercase tracking-[0.4em]">Vault_Empty // No_Active_Breach_Data</td></tr>
                 ` : this.artifacts.map(a => `
                    <tr class="hover:bg-white/[0.02] transition-colors group">
                       <td class="p-4 truncate">
                          <span class="mono text-[10px] text-white font-bold tabular-nums">${globalThis.escapeHTML(a.name)}</span>
                       </td>
                       <td class="p-4">
                          <span class="status-pill ${a.type === 'NETWORK_CAPTURE' ? 'primary' : 'warning'} !px-3 !py-0.5 text-[8px]">
                             ${a.type}
                          </span>
                       </td>
                       <td class="p-4">
                          <span class="mono text-[10px] text-slate-400 tabular-nums">${(a.size / 1024 / 1024).toFixed(2)} MB</span>
                       </td>
                       <td class="p-4">
                          <span class="mono text-[10px] text-slate-500 font-bold">
                             ${new Date(a.mtime).toLocaleString('en-GB', {hour12:false})}
                          </span>
                       </td>
                       <td class="p-4 text-right">
                          <a href="/api/reports/forensics/download/${globalThis.escapeHTML(a.name)}" class="mono-xs text-primary hover:text-white transition-colors uppercase font-black" download>Download</a>
                       </td>
                    </tr>
                 `).join('')}
              </tbody>
           </table>
        </div>
      </div>
    `;
  }
}

customElements.define('forensic-vault', ForensicVault);
