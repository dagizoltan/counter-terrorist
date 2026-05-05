class ThreatExplorer extends HTMLElement {
  constructor() {
    super();
    this.threats = [];
    this.stats = {};
    this.selectedIps = new Set();
    this.filter = {
      provider: '',
      search: '',
      offset: '',
      type: 'IP'
    };
    this.loading = false;
  }

  async connectedCallback() {
    await this.fetchStats();
    await this.fetchThreats();
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

  async fetchThreats(append = false) {
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
        this.threats = append ? [...this.threats, ...threats] : threats;
        this.filter.offset = nextCursor;
      }
    } catch (e) {
      console.error('Failed to fetch threats', e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  setProvider(provider) {
    this.filter.provider = this.filter.provider === provider ? '' : provider;
    this.filter.offset = '';
    this.threats = [];
    this.selectedIps.clear();
    this.fetchThreats();
  }

  setSearch(val) {
    this.filter.search = val;
    this.filter.offset = '';
    this.selectedIps.clear();
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.fetchThreats(), 500);
  }

  toggleSelect(ip) {
    if (this.selectedIps.has(ip)) {
      this.selectedIps.delete(ip);
    } else {
      this.selectedIps.add(ip);
    }
    this.render();
  }

  toggleSelectAll() {
    const allVisible = this.threats.filter(t => !t.blocked).map(t => t.indicator);
    const areAllSelected = allVisible.every(ip => this.selectedIps.has(ip));
    
    if (areAllSelected) {
      allVisible.forEach(ip => this.selectedIps.delete(ip));
    } else {
      allVisible.forEach(ip => this.selectedIps.add(ip));
    }
    this.render();
  }

  async bulkBlock() {
    const ips = Array.from(this.selectedIps);
    if (ips.length === 0) return;
    
    if (!confirm(`CONFIRM_BULK_ISOLATION: ${ips.length} INDICATORS?`)) return;

    this.loading = true;
    this.render();
    try {
      await Promise.all(ips.map(ip => 
        fetch('/api/defense/isolate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: ip, reason: 'Bulk tactical isolation from intelligence feed' })
        })
      ));
      this.selectedIps.clear();
      await this.fetchThreats();
    } catch (e) {
      console.error('Bulk block failed', e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async syncFeeds(provider = null) {
    if (this.loading) return;
    this.loading = true;
    this.render();
    try {
      await fetch('/api/threats/identified/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      // Give it a moment to start ingesting then refresh stats
      setTimeout(() => {
        this.fetchStats();
        this.fetchThreats();
      }, 3000);
    } catch (e) {
      console.error('Failed to sync feeds', e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  render() {
    const totalCount = Object.values(this.stats).reduce((a, b) => a + b, 0);
    const selectedCount = this.selectedIps.size;

    this.innerHTML = `
      <div class="grid grid-cols-12 gap-10">
        <!-- 01 Left Deck: Provider Controls -->
        <div class="col-span-12 lg:col-span-4 space-y-8">
          <div class="t-panel glass-panel p-8 bg-black/40 border-t-2 border-primary/20 shadow-2xl">
             <div class="flex justify-between items-center mb-10">
                <div class="flex flex-col gap-1">
                   <h3 class="mono-xs font-black text-slate-500 uppercase tracking-widest">Intelligence_Sources</h3>
                   <span class="mono text-[8px] text-slate-600 uppercase">Enforcement_Priority: HIGH</span>
                </div>
                <div class="flex flex-col items-end">
                   <span class="mono text-[10px] text-primary font-black tabular-nums">${totalCount.toLocaleString()}</span>
                   <span class="mono text-[7px] text-slate-500 uppercase">TOTAL_INDICATORS</span>
                </div>
             </div>
             
             <div class="space-y-3">
                ${Object.keys(this.stats).length === 0 ? `
                   <div class="p-8 border border-white/5 bg-black/20 rounded-xl text-center opacity-40">
                      <span class="mono-xs uppercase">Initializing_Provider_Stats...</span>
                   </div>
                ` : Object.entries(this.stats).map(([name, count]) => `
                  <div class="flex items-center gap-2 group/row">
                    <button onclick="this.closest('threat-explorer').setProvider('${name}')" 
                      class="flex-grow flex justify-between items-center p-5 rounded-xl border transition-all ${this.filter.provider === name ? 'bg-primary/20 border-primary shadow-lg shadow-primary/10' : 'bg-white/5 border-white/5 hover:border-white/20'}">
                      <div class="flex items-center gap-4">
                         <div class="w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-success animate-pulse' : 'bg-slate-700'}"></div>
                         <span class="mono-xs font-black text-white uppercase tracking-widest">${name}</span>
                      </div>
                      <span class="mono-xs text-slate-400 font-bold tabular-nums">${count.toLocaleString()}</span>
                    </button>
                    <button onclick="this.closest('threat-explorer').syncFeeds('${name}')" 
                      class="p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-primary/20 hover:border-primary/40 text-slate-500 hover:text-primary transition-all opacity-0 group-hover/row:opacity-100" title="Sync This Provider">
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    </button>
                  </div>
                `).join('')}
             </div>

             <div class="mt-10 pt-8 border-t border-white/5">
                <button onclick="this.closest('threat-explorer').syncFeeds()" class="t-btn primary w-full justify-center py-5 group ${this.loading ? 'opacity-50 pointer-events-none' : ''}">
                   <svg class="transition-transform group-hover:rotate-180 duration-700 ${this.loading ? 'animate-spin' : ''}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                   <span class="mono-xs font-black uppercase tracking-widest">${this.loading ? 'Synchronizing_Feeds...' : 'Global_Perimeter_Sync'}</span>
                </button>
             </div>
          </div>

          <div class="t-panel glass-panel p-8 bg-black/40 border-t-2 border-danger/20">
             <h3 class="mono-xs font-black text-slate-500 uppercase tracking-widest mb-6">Database_Integrity</h3>
             <button onclick="this.closest('threat-explorer').wipeDatabase()" class="t-btn danger w-full justify-center py-4 text-[10px] font-black uppercase tracking-widest">
                Purge_Historical_Ledger
             </button>
          </div>
        </div>

        <!-- 02 Right Deck: Threat Ledger -->
        <div class="col-span-12 lg:col-span-8">
           <div class="t-panel glass-panel p-0 bg-black/40 overflow-hidden shadow-2xl flex flex-col min-h-[800px] border-t-2 border-primary/10">
              <header class="p-8 border-b border-white/5 bg-black/60 flex justify-between items-center backdrop-blur-xl sticky top-0 z-20">
                 <div class="flex items-center gap-6">
                    <div class="flex flex-col gap-1">
                       <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">Forensic_Malware_Ledger</span>
                       <span class="mono text-[7px] text-slate-600 uppercase">Live_Enforcement_Active</span>
                    </div>
                    ${this.filter.provider ? `<span class="status-pill warning active !px-4 !py-1 text-[8px]">${this.filter.provider}</span>` : ''}
                    ${this.loading ? `<span class="mono text-[8px] text-primary animate-pulse uppercase">Traversing_Database...</span>` : ''}
                 </div>
                 <div class="flex items-center gap-4">
                    <div class="relative group">
                       <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-primary transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                       </div>
                       <input type="text" value="${this.filter.search}" oninput="this.closest('threat-explorer').setSearch(this.value)" 
                         class="bg-black/80 border border-white/10 rounded-xl pl-12 pr-6 py-3 mono-xs text-white focus:border-primary outline-none transition-all w-64 shadow-2xl" 
                         placeholder="SCAN_INDICATORS..." />
                    </div>
                 </div>
              </header>

              ${selectedCount > 0 ? `
                 <div class="bg-primary/20 border-b border-primary/40 px-8 py-4 flex justify-between items-center animate-in slide-in-from-top-2 duration-300">
                    <div class="flex items-center gap-4">
                       <span class="mono-xs font-black text-primary uppercase tracking-widest">${selectedCount} INDICATORS_SELECTED</span>
                    </div>
                    <div class="flex gap-4">
                       <button onclick="this.closest('threat-explorer').bulkBlock()" class="t-btn primary !py-2 !px-8 text-[9px] font-black uppercase tracking-widest shadow-lg shadow-primary/20">
                          Commit_Bulk_Isolation
                       </button>
                       <button onclick="this.closest('threat-explorer').selectedIps.clear(); this.closest('threat-explorer').render()" class="mono-xs text-slate-400 font-bold uppercase tracking-widest hover:text-white transition-colors">
                          Cancel
                       </button>
                    </div>
                 </div>
              ` : ''}

              <div class="flex-grow overflow-y-auto custom-scrollbar">
                 <table class="w-full text-left border-collapse">
                    <thead class="sticky top-0 bg-black/40 backdrop-blur-md z-10 border-b border-white/5 shadow-xl">
                       <tr>
                          <th class="p-6 w-12">
                             <input type="checkbox" onchange="this.closest('threat-explorer').toggleSelectAll()" 
                               class="accent-primary w-4 h-4 rounded border-white/10 bg-black" />
                          </th>
                          <th class="p-6 mono-xs text-slate-600 font-black uppercase tracking-widest">Indicator_Entity</th>
                          <th class="p-6 mono-xs text-slate-600 font-black uppercase tracking-widest">Reputation_Score</th>
                          <th class="p-6 mono-xs text-slate-600 font-black uppercase tracking-widest">Temporal_Data</th>
                          <th class="p-6 mono-xs text-slate-600 font-black uppercase tracking-widest text-right">Defense_Status</th>
                       </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                       ${this.threats.length === 0 && !this.loading ? `
                          <tr>
                             <td colspan="5" class="p-32 text-center">
                                <div class="flex flex-col items-center gap-6 opacity-30">
                                   <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v4"/><path d="m4.93 4.93 2.83 2.83"/><path d="M2 12h4"/><path d="m4.93 19.07 2.83-2.83"/><path d="M12 18v4"/><path d="m16.24 16.24 2.83 2.83"/><path d="M18 12h4"/><path d="m16.24 7.76 2.83-2.83"/></svg>
                                   <span class="mono-xs font-black uppercase tracking-[0.4em] text-center">
                                      ${totalCount > 0 ? 'No_Matches_Found_In_Historical_Ledger' : 'Intelligence_Cache_Empty_//_Please_Sync'}
                                   </span>
                                </div>
                             </td>
                          </tr>
                       ` : this.threats.length === 0 && this.loading ? `
                          <tr>
                             <td colspan="5" class="p-32 text-center">
                                <div class="flex flex-col items-center gap-6">
                                   <div class="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                                   <span class="mono-xs font-black text-primary uppercase tracking-[0.4em]">Traversing_Forensic_Records...</span>
                                </div>
                             </td>
                          </tr>
                       ` : this.threats.map(t => `
                          <tr class="hover:bg-white/[0.03] transition-all group border-l-2 border-transparent ${this.selectedIps.has(t.indicator) ? 'bg-primary/5 border-primary/40' : 'hover:border-' + (t.blocked ? 'success' : 'primary') + '/40'}">
                             <td class="p-6">
                                ${t.blocked ? '' : `
                                   <input type="checkbox" ${this.selectedIps.has(t.indicator) ? 'checked' : ''} 
                                     onchange="this.closest('threat-explorer').toggleSelect('${t.indicator}')"
                                     class="accent-primary w-4 h-4 rounded border-white/10 bg-black cursor-pointer" />
                                `}
                             </td>
                             <td class="p-6">
                                <div class="flex flex-col gap-1">
                                   <span class="text-lg font-black text-white italic tracking-tighter uppercase group-hover:text-primary transition-colors">${t.indicator}</span>
                                   <span class="mono text-[7px] text-slate-500 font-black uppercase tracking-widest">${t.threatType} // ORIGIN: ${t.provider}</span>
                                </div>
                             </td>
                             <td class="p-6">
                                <div class="flex flex-col gap-2 w-32">
                                   <div class="flex justify-between items-end">
                                      <span class="status-pill ${t.score >= 85 ? 'danger' : 'warning'} !px-3 !py-0.5 text-[8px] font-black">${t.score >= 85 ? 'CRITICAL' : 'HIGH'}</span>
                                      <span class="mono text-[10px] font-black text-white tabular-nums">${t.score}%</span>
                                   </div>
                                   <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                                      <div class="h-full ${t.score >= 85 ? 'bg-danger' : 'bg-warning'}" style="width: ${t.score}%"></div>
                                   </div>
                                </div>
                             </td>
                             <td class="p-6">
                                <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest group-hover:text-slate-300 transition-colors">
                                   ${new Date(t.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                </span>
                             </td>
                             <td class="p-6 text-right">
                                ${t.blocked ? `
                                   <div class="flex items-center justify-end gap-2 text-success">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                      <span class="mono text-[9px] font-black uppercase tracking-widest">Neutralized</span>
                                   </div>
                                ` : `
                                   <button onclick="this.closest('threat-explorer').blockIp('${t.indicator}', '${t.provider}')" 
                                     class="t-btn primary !px-6 !py-2 text-[9px] font-black uppercase tracking-[0.2em] hover:scale-105 transition-transform">
                                      Isolate_Origin
                                   </button>
                                `}
                             </td>
                          </tr>
                       `).join('')}
                    </tbody>
                 </table>
              </div>
              
              ${this.filter.offset ? `
                <footer class="p-6 border-t border-white/5 bg-black/60 text-center">
                   <button onclick="this.closest('threat-explorer').fetchThreats(true)" class="mono-xs text-primary font-black uppercase tracking-[0.4em] hover:text-white transition-colors">
                      Fetch_Historical_Indicators_↓
                   </button>
                </footer>
              ` : ''}
           </div>
        </div>
      </div>
    `;
  }

  async blockIp(ip, provider) {
    if (this.loading) return;
    this.loading = true;
    this.render();
    try {
      const resp = await fetch('/api/defense/isolate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          source: ip, 
          reason: `Tactical manual block from intelligence feed: ${provider}` 
        })
      });
      if (resp.ok) {
        // Optimistically update the list
        this.threats = this.threats.map(t => t.indicator === ip ? { ...t, blocked: true } : t);
      }
    } catch (e) {
      console.error('Failed to block IP', e);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  async wipeDatabase() {
    if (!confirm('CONFIRM_COMPLETE_INTEL_PURGE?')) return;
    this.loading = true;
    this.render();
    try {
      await fetch('/api/threats/identified/wipe', { method: 'POST' });
      this.threats = [];
      this.stats = {};
      await this.fetchStats();
    } finally {
      this.loading = false;
      this.render();
    }
  }
}

customElements.define('threat-explorer', ThreatExplorer);
