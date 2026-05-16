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
    this.connectWS();
    this.render();
  }

  connectWS() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
    const ws = new SharedWebSocket(`${protocol}//${window.location.host}/api/ws/events${csrfToken ? `?token=${csrfToken}` : ''}`);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // type === 'THREAT' comes from EventMediator when a sidecar detects something
        // OR AUDIT_EVENT with data.type === 'THREAT'
        if (payload.type === 'THREAT' || (payload.type === 'AUDIT_EVENT' && payload.data?.type === 'THREAT')) {
          const threat = payload.data?.data || payload.data || payload;
          if (threat.indicator) {
            this.addThreat(threat);
          }
        }
      } catch (e) {}
    };

    ws.onclose = () => setTimeout(() => this.connectWS(), 5000);
  }

  addThreat(threat) {
    // Check if already exists
    const index = this.threats.findIndex(t => t.indicator === threat.indicator);
    if (index !== -1) {
      this.threats[index] = { ...this.threats[index], ...threat };
    } else {
      this.threats.unshift(threat);
      if (this.threats.length > 500) this.threats.pop();
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

        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const resp = await fetch(`/api/threats/identified?${params.toString()}`, {
          headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
        });
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
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      await fetch('/api/threats/identified/sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CT-Token': csrfToken } : {})
        },
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
      <div class="flex flex-col gap-10">
        <!-- 01 Provider Row: Grid Layout -->
        <div class="t-panel glass-panel p-8 bg-black/40 border-t-2 border-primary/20 shadow-2xl">
           <div class="flex justify-between items-center mb-8 pb-6 border-b border-white/5">
              <div class="flex flex-col gap-1">
                 <h3 class="mono-xs font-black text-slate-500 uppercase tracking-widest">Intelligence_Sources</h3>
                 <span class="mono text-[8px] text-slate-600 uppercase">Enforcement_Priority: HIGH // Total: ${totalCount.toLocaleString()}</span>
              </div>
              <div class="flex gap-4">
                 <button onclick="this.closest('threat-explorer').syncFeeds()" class="t-btn primary !py-2 !px-6 group ${this.loading ? 'opacity-50 pointer-events-none' : ''}">
                    <svg class="transition-transform group-hover:rotate-180 duration-700 ${this.loading ? 'animate-spin' : ''}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                    <span class="mono text-[9px] font-black uppercase tracking-widest">Global_Sync</span>
                 </button>
                 <button onclick="this.closest('threat-explorer').wipeDatabase()" class="t-btn danger !py-2 !px-6">
                    <span class="mono text-[9px] font-black uppercase tracking-widest">Purge_DB</span>
                 </button>
              </div>
           </div>
           
           <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              ${Object.entries(this.stats).map(([name, count]) => `
                <button onclick="this.closest('threat-explorer').setProvider('${name}')" 
                  class="flex flex-col gap-2 p-5 rounded-xl border transition-all text-left ${this.filter.provider === name ? 'bg-primary/20 border-primary shadow-lg shadow-primary/10' : 'bg-white/5 border-white/5 hover:border-white/20'}">
                  <div class="flex justify-between items-center">
                     <span class="mono-xs font-black text-white uppercase tracking-widest truncate">${name}</span>
                     <div class="w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-success animate-pulse' : 'bg-slate-700'}"></div>
                  </div>
                  <span class="text-xl font-black text-white italic tabular-nums">${count.toLocaleString()}</span>
                </button>
              `).join('')}
           </div>
        </div>

        <!-- 02 Threat Ledger: Full Width Table -->
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
              <table class="w-full text-left border-collapse table-fixed">
                  <thead class="sticky top-0 bg-black/40 backdrop-blur-md z-10 border-b border-white/5 shadow-xl text-[7px]">
                    <tr>
                       <th class="p-1 w-8 text-center">
                          <input type="checkbox" onchange="this.closest('threat-explorer').toggleSelectAll()" 
                            class="accent-primary w-2 h-2 rounded border-white/10 bg-black" />
                       </th>
                       <th class="p-1 w-[16%] mono text-slate-600 uppercase">Indicator_IP</th>
                       <th class="p-1 w-[8%] mono text-slate-600 uppercase">Origin</th>
                       <th class="p-1 w-[18%] mono text-slate-600 uppercase">Carrier_ASN</th>
                       <th class="p-1 w-[20%] mono text-slate-600 uppercase">Reason_Threat</th>
                       <th class="p-1 w-[8%] mono text-slate-600 uppercase">Source</th>
                       <th class="p-1 w-[10%] mono text-slate-600 uppercase">Risk</th>
                       <th class="p-1 w-[10%] mono text-slate-600 uppercase">Last_Seen</th>
                       <th class="p-1 w-[10%] mono text-slate-600 uppercase text-right">Op</th>
                    </tr>
                 </thead>
                 <tbody class="divide-y divide-white/5">
                    ${(() => {
                      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
                      
                      const validThreats = this.threats
                        .filter(t => t.type === 'IP' && ipRegex.test(t.indicator))
                        .sort((a, b) => {
                          const dateA = new Date(a.lastSeen).getTime();
                          const dateB = new Date(b.lastSeen).getTime();
                          if (dateA !== dateB) return dateB - dateA;
                          return b.score - a.score;
                        });
                      
                      if (validThreats.length === 0 && !this.loading) {
                        return `<tr><td colspan="9" class="p-8 text-center mono text-[8px] opacity-20 uppercase">Empty_Dataset</td></tr>`;
                      }
                      
                      return validThreats.map(t => {
                         const isBP = t.geo?.isBulletproof;
                         return `
                         <tr class="hover:bg-white/[0.02] transition-all group border-l border-transparent ${this.selectedIps.has(t.indicator) ? 'bg-primary/5 border-primary/20' : 'hover:border-primary/10'} ${t.blocked ? 'opacity-40 grayscale-[0.5]' : ''}">
                            <td class="p-1 text-center">
                               ${t.blocked ? '' : `
                                  <input type="checkbox" ${this.selectedIps.has(t.indicator) ? 'checked' : ''} 
                                    onchange="this.closest('threat-explorer').toggleSelect('${t.indicator}')"
                                    class="accent-primary w-2 h-2 rounded border-white/10 bg-black cursor-pointer" />
                               `}
                            </td>
                            <td class="p-1 truncate">
                               <span class="mono text-[9px] text-white tabular-nums">${t.indicator}</span>
                            </td>
                            <td class="p-1">
                               <span class="px-1.5 py-0.5 rounded-sm bg-white/5 border border-white/10 mono text-[7px] text-slate-400 font-black uppercase">
                                  ${t.geo?.country || '??'}
                               </span>
                            </td>
                            <td class="p-1 truncate">
                               <div class="flex flex-col">
                                  <span class="mono text-[6px] ${isBP ? 'text-danger font-black' : 'text-slate-500'} uppercase truncate">${t.geo?.isp || 'Unknown_Carrier'}</span>
                                  <span class="mono text-[5px] text-slate-700">${t.geo?.asn || 'AS_UNKNOWN'}</span>
                               </div>
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
                            <td class="p-1">
                               <span class="mono text-[6.5px] text-slate-700 font-bold uppercase">
                                  ${new Date(t.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12: false})}
                                </span>
                            </td>
                            <td class="p-1 text-right">
                               ${t.blocked ? `
                                  <span class="mono text-[5px] text-success/40 uppercase font-black">LKD</span>
                                ` : `
                                  <button onclick="this.closest('threat-explorer').blockIp('${t.indicator}', '${t.provider}')" 
                                    class="border border-primary/20 hover:bg-primary/20 hover:border-primary px-1.5 py-0 mono text-[5px] text-primary/60 hover:text-primary transition-all">
                                     ISO
                                  </button>
                                `}
                            </td>
                         </tr>
                      `}).join('');
                    })()}
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
