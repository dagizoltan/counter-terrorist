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
    await this.fetchStats();
    await this.fetchArtifacts();
    this.render();
  }

  async fetchStats() {
    try {
      const resp = await fetch('/api/threats/identified/stats');
      if (resp.ok) {
        this.stats = await resp.json();
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

      const resp = await fetch(`/api/threats/identified?${params.toString()}`);
      if (resp.ok) {
        const { threats, nextCursor } = await resp.json();
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
    const totalCount = Object.values(this.stats).reduce((a, b) => a + b, 0);
    const selectedCount = this.selectedHashes.size;

    this.innerHTML = `
      <div class="flex flex-col gap-10">
        <!-- 01 Provider Row: Grid Layout -->
        <div class="t-panel glass-panel p-8 bg-black/40 border-t-2 border-warning/20 shadow-2xl">
           <div class="flex justify-between items-center mb-8 pb-6 border-b border-white/5">
              <div class="flex flex-col gap-1">
                 <h3 class="mono-xs font-black text-slate-500 uppercase tracking-widest">Artifact_Sources</h3>
                 <span class="mono text-[8px] text-slate-600 uppercase">Analysis_Priority: CRITICAL // Total: ${totalCount.toLocaleString()}</span>
              </div>
              <div class="flex gap-4">
                 <button onclick="this.closest('artifact-explorer').syncArtifacts()" class="t-btn primary !py-2 !px-6 group ${this.loading ? 'opacity-50 pointer-events-none' : ''}">
                    <svg class="transition-transform group-hover:rotate-180 duration-700 ${this.loading ? 'animate-spin' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    <span class="mono text-[9px] font-black uppercase tracking-widest">Global_Artifact_Sync</span>
                 </button>
              </div>
           </div>
           
           <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              ${Object.entries(this.stats).map(([name, count]) => `
                <button onclick="this.closest('artifact-explorer').setProvider('${name}')" 
                  class="flex flex-col gap-2 p-5 rounded-xl border transition-all text-left ${this.filter.provider === name ? 'bg-warning/20 border-warning shadow-lg shadow-warning/10' : 'bg-white/5 border-white/5 hover:border-white/20'}">
                  <div class="flex justify-between items-center">
                     <span class="mono-xs font-black text-white uppercase tracking-widest truncate">${name}</span>
                     <div class="w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-warning animate-pulse' : 'bg-slate-700'}"></div>
                  </div>
                  <span class="text-xl font-black text-white italic tabular-nums">${count.toLocaleString()}</span>
                </button>
              `).join('')}
           </div>
        </div>

        <!-- 02 Artifact Ledger -->
        <div class="t-panel glass-panel p-0 bg-black/40 overflow-hidden shadow-2xl flex flex-col min-h-[800px] border-t-2 border-warning/10">
           <header class="p-8 border-b border-white/5 bg-black/60 flex justify-between items-center backdrop-blur-xl sticky top-0 z-20">
              <div class="flex items-center gap-6">
                 <div class="flex flex-col gap-1">
                    <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">Binary_Forensic_Registry</span>
                    <span class="mono text-[7px] text-slate-600 uppercase">Artifact_DNA_Analysis_Active</span>
                 </div>
                 ${this.filter.provider ? `<span class="status-pill warning active !px-4 !py-1 text-[8px]">${this.filter.provider}</span>` : ''}
              </div>
              <div class="flex items-center gap-4">
                 <div class="relative group">
                    <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-warning transition-colors">
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    </div>
                    <input type="text" value="${this.filter.search}" oninput="this.closest('artifact-explorer').setSearch(this.value)" 
                      class="bg-black/80 border border-white/10 rounded-xl pl-12 pr-6 py-3 mono-xs text-white focus:border-warning outline-none transition-all w-64 shadow-2xl" 
                      placeholder="SEARCH_HASHES..." />
                 </div>
              </div>
           </header>

           <div class="flex-grow overflow-y-auto custom-scrollbar">
              <table class="w-full text-left border-collapse table-fixed">
                 <thead class="sticky top-0 bg-black/40 backdrop-blur-md z-10 border-b border-white/5 shadow-xl text-[7px]">
                    <tr>
                       <th class="p-1 w-8 text-center">
                          <input type="checkbox" onchange="this.closest('artifact-explorer').toggleSelectAll()" 
                            class="accent-warning w-2 h-2 rounded border-white/10 bg-black" />
                       </th>
                       <th class="p-1 w-[40%] mono text-slate-600 uppercase">Artifact_Indicator (SHA256/Pattern)</th>
                       <th class="p-1 w-[20%] mono text-slate-600 uppercase">Malware_Family</th>
                       <th class="p-1 w-[12%] mono text-slate-600 uppercase">Source</th>
                       <th class="p-1 w-[10%] mono text-slate-600 uppercase">Risk</th>
                       <th class="p-1 w-[18%] mono text-slate-600 uppercase text-right">Last_Observed</th>
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
                        return `<tr><td colspan="6" class="p-8 text-center mono text-[8px] opacity-20 uppercase">No_Artifacts_Discovered</td></tr>`;
                      }
                      
                      return validArtifacts.map(t => `
                         <tr class="hover:bg-white/[0.02] transition-all group border-l border-transparent ${this.selectedHashes.has(t.indicator) ? 'bg-warning/5 border-warning/20' : 'hover:border-warning/10'}">
                            <td class="p-1 text-center">
                               <input type="checkbox" ${this.selectedHashes.has(t.indicator) ? 'checked' : ''} 
                                 onchange="this.closest('artifact-explorer').toggleSelect('${t.indicator}')"
                                 class="accent-warning w-2 h-2 rounded border-white/10 bg-black cursor-pointer" />
                            </td>
                            <td class="p-1 truncate">
                               <span class="mono text-[8px] text-white tabular-nums">${t.indicator}</span>
                            </td>
                            <td class="p-1 truncate">
                               <span class="mono text-[6.5px] text-slate-500 uppercase">${t.threatType}</span>
                            </td>
                            <td class="p-1">
                               <span class="mono text-[6.5px] text-slate-600 font-bold uppercase">${t.provider}</span>
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
                               <span class="mono text-[6.5px] text-slate-700 font-bold uppercase">
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
