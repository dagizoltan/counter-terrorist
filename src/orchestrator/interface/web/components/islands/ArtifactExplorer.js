import { unwrap } from "./api.js";
import { bindActions, preserveFocus } from "./actions.js";
class ArtifactExplorer extends HTMLElement {
  constructor() {
    super();
    this.artifacts = [];
    this.stats = {};
    this.selectedHashes = new Set();
    this.filter = {
      provider: '',
      search: '',
      offset: '',
      type: 'HASH'
    };
    this.loading = false;
  }

  async connectedCallback() {
    // Delegated, because an inline onclick/oninput is refused under the CSP.
    bindActions(this, {
      syncArtifacts: () => this.syncArtifacts(),
      setProvider: (el) => this.setProvider(el.dataset.provider),
      setSearch: (el) => this.setSearch(el.value),
      toggleSelectAll: () => this.toggleSelectAll(),
      toggleSelect: (el) => this.toggleSelect(el.dataset.indicator),
    });
    await this.fetchStats();
    await this.fetchArtifacts();
    this.connectWS();
    this.render();
  }

  connectWS() {
    const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new SharedWebSocket();

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'THREAT' || (payload.type === 'AUDIT_EVENT' && payload.data?.type === 'THREAT')) {
          const artifact = payload.data?.data || payload.data || payload;
          if (artifact.indicator && artifact.type === 'HASH') {
            this.addArtifact(artifact);
          }
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connectWS(), 5000);
  }

  addArtifact(artifact) {
    const index = this.artifacts.findIndex(a => a.indicator === artifact.indicator);
    if (index !== -1) {
      this.artifacts[index] = { ...this.artifacts[index], ...artifact };
    } else {
      this.artifacts.unshift(artifact);
      if (this.artifacts.length > 500) this.artifacts.pop();
    }
    this.render();
  }

  async fetchStats() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const resp = await fetch('/api/threats/identified/stats', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (resp.ok) {
        this.stats = await unwrap(resp);
        this.render();
      }
    } catch (e) {
      console.error('Failed to fetch stats', e);
    }
  }

  async fetchArtifacts(append = false) {
    if (this.loading) return;
    this.loading = true;
    this.render();
    try {
      const params = new URLSearchParams({
        type: this.filter.type,
        limit: '100',
        provider: this.filter.provider,
        search: this.filter.search,
        offset: append ? this.filter.offset : ''
      });

      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const resp = await fetch(`/api/threats/identified?${params.toString()}`, {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (resp.ok) {
        const { threats, nextCursor } = await unwrap(resp);
        this.artifacts = append ? [...this.artifacts, ...threats] : threats;
        this.filter.offset = nextCursor;
      }
    } catch (e) {
      console.error('Failed to fetch artifacts', e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  setProvider(provider) {
    this.filter.provider = this.filter.provider === provider ? '' : provider;
    this.filter.offset = '';
    this.artifacts = [];
    this.selectedHashes.clear();
    this.fetchArtifacts();
  }

  setSearch(val) {
    this.filter.search = val;
    this.filter.offset = '';
    this.selectedHashes.clear();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchArtifacts(), 500);
  }

  toggleSelect(hash) {
    if (this.selectedHashes.has(hash)) {
      this.selectedHashes.delete(hash);
    } else {
      this.selectedHashes.add(hash);
    }
    this.render();
  }

  toggleSelectAll() {
    const allVisible = this.artifacts.map(t => t.indicator);
    const areAllSelected = allVisible.every(hash => this.selectedHashes.has(hash));
    
    if (areAllSelected) {
      allVisible.forEach(hash => this.selectedHashes.delete(hash));
    } else {
      allVisible.forEach(hash => this.selectedHashes.add(hash));
    }
    this.render();
  }

  async syncArtifacts(provider = null) {
    if (this.loading) return;
    this.loading = true;
    this.render();
    try {
      await fetch('/api/threats/identified/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      setTimeout(() => {
        this.fetchStats();
        this.fetchArtifacts();
      }, 3000);
    } catch (e) {
      console.error('Failed to sync artifacts', e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    // Re-render inside preserveFocus: the search field is replaced wholesale
    // and would otherwise lose focus mid-word once the debounce fires.
    preserveFocus(this, () => this.paint());
  }

  paint() {
    const totalCount = Object.values(this.stats).reduce((a, b) => a + b, 0);
    const selectedCount = this.selectedHashes.size;

    this.innerHTML = `
      <div class="flex flex-col gap-4">
        <!-- 01 Provider Row: Grid Layout -->
        <div class="t-panel glass-panel p-4 bg-black/40 border-t-2 border-warning/20 shadow-2xl">
           <div class="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
              <div class="flex flex-col gap-1">
                 <h3 class="eyebrow">Artifact_Sources</h3>
                 <span class="eyebrow">Analysis_Priority: CRITICAL // Total: ${totalCount.toLocaleString()}</span>
              </div>
              <div class="flex gap-4">
                 <button type="button" data-action="syncArtifacts" class="t-btn primary !py-2 !px-4 group ${this.loading ? 'opacity-50 pointer-events-none' : ''}">
                    <svg class="transition-transform group-hover:rotate-180 duration-700 ${this.loading ? 'animate-spin' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    <span class="eyebrow">Global_Artifact_Sync</span>
                 </button>
              </div>
           </div>
           
           <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              ${Object.entries(this.stats).map(([name, count]) => `
                <button type="button" data-action="setProvider" data-provider="${name}"
                  class="flex flex-col gap-2 p-3 rounded-lg border transition-all text-left ${this.filter.provider === name ? 'bg-warning/20 border-warning shadow-lg shadow-warning/10' : 'bg-white/5 border-white/5 hover:border-white/20'}">
                  <div class="flex justify-between items-center">
                     <span class="eyebrow truncate" data-tone="strong">${name}</span>
                     <div class="w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-warning animate-pulse' : 'bg-slate-700'}"></div>
                  </div>
                  <span class="text-xl font-black text-white tabular-nums">${count.toLocaleString()}</span>
                </button>
              `).join('')}
           </div>
        </div>

        <!-- 02 Artifact Ledger -->
        <div class="t-panel glass-panel p-0 bg-black/40 overflow-hidden shadow-2xl flex flex-col min-h-[800px] border-t-2 border-warning/10">
           <header class="p-4 border-b border-white/5 bg-black/60 flex justify-between items-center backdrop-blur-xl sticky top-0 z-20">
              <div class="flex items-center gap-4">
                 <div class="flex flex-col gap-1">
                    <span class="eyebrow">Binary_Forensic_Registry</span>
                    <span class="eyebrow">Artifact_DNA_Analysis_Active</span>
                 </div>
                 ${this.filter.provider ? `<span class="status-pill warning active">${this.filter.provider}</span>` : ''}
              </div>
              <div class="flex items-center gap-4">
                 <div class="relative group">
                    <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-warning transition-colors">
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    </div>
                    <input type="text" value="${this.filter.search}" data-action="setSearch" data-on="input" 
                      class="bg-black/80 border border-white/10 rounded-lg pl-5 pr-4 py-3 mono-xs text-white focus:border-warning outline-none transition-all w-64 shadow-2xl" 
                      placeholder="SEARCH_HASHES..." />
                 </div>
              </div>
           </header>

           <div class="flex-grow overflow-y-auto custom-scrollbar">
              <table class="w-full text-left border-collapse table-fixed">
                 <thead class="sticky top-0 bg-black/40 backdrop-blur-md z-10 border-b border-white/5 shadow-xl text-[7px]">
                    <tr>
                       <th class="p-1 w-8 text-center">
                          <input type="checkbox" data-action="toggleSelectAll" data-on="change" 
                            class="accent-warning w-2 h-2 rounded border-white/10 bg-black" />
                       </th>
                       <th class="eyebrow p-1 w-[40%]">Artifact_Indicator (SHA256/Pattern)</th>
                       <th class="eyebrow p-1 w-[20%]">Malware_Family</th>
                       <th class="eyebrow p-1 w-[12%]">Source</th>
                       <th class="eyebrow p-1 w-[10%]">Risk</th>
                       <th class="eyebrow p-1 w-[18%] text-right">Last_Observed</th>
                    </tr>
                 </thead>
                 <tbody class="divide-y divide-white/5">
                    ${(() => {
                      const validArtifacts = this.artifacts
                        .sort((a, b) => {
                          const dateA = new Date(a.lastSeen).getTime();
                          const dateB = new Date(b.lastSeen).getTime();
                          if (dateA !== dateB) return dateB - dateA;
                          return b.score - a.score;
                        });
                      
                      if (validArtifacts.length === 0 && !this.loading) {
                        return `<tr><td colspan="6" class="eyebrow p-4 text-center opacity-20">No_Artifacts_Discovered</td></tr>`;
                      }
                      
                      return validArtifacts.map(t => `
                         <tr class="hover:bg-white/[0.02] transition-all group border-l border-transparent ${this.selectedHashes.has(t.indicator) ? 'bg-warning/5 border-warning/20' : 'hover:border-warning/10'} ${t.blocked ? 'opacity-40 grayscale-[0.5]' : ''}">
                            <td class="p-1 text-center">
                               <input type="checkbox" ${this.selectedHashes.has(t.indicator) ? 'checked' : ''} 
                                 data-action="toggleSelect" data-on="change" data-indicator="${t.indicator}"
                                 class="accent-warning w-2 h-2 rounded border-white/10 bg-black cursor-pointer" />
                            </td>
                            <td class="p-1 truncate">
                               <span class="mono text-[8px] text-white tabular-nums">${t.indicator}</span>
                            </td>
                            <td class="p-1 truncate">
                               <span class="eyebrow">${t.threatType}</span>
                            </td>
                            <td class="p-1">
                               <span class="eyebrow">${t.provider}</span>
                            </td>
                            <td class="p-1">
                               <div class="flex items-center gap-1">
                                  <span class="mono text-[6.5px] text-slate-400 tabular-nums">${t.score}</span>
                                  <div class="flex-grow h-[1px] bg-white/5 overflow-hidden">
                                     <div class="h-full ${t.score >= 85 ? 'bg-danger' : 'bg-warning'}" style="width: ${t.score}%"></div>
                                  </div>
                               </div>
                            </td>
                            <td class="p-1 text-right">
                               <span class="eyebrow">
                                  ${new Date(t.lastSeen).toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false})}
                               </span>
                            </td>
                         </tr>
                      `).join('');
                    })()}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    `;
  }
}

customElements.define('artifact-explorer', ArtifactExplorer);
