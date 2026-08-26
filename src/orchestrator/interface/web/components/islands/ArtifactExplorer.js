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
    // Artifact indicators, families and provider names all arrive from
    // third-party feeds and were interpolated raw into innerHTML. Same defect
    // as ThreatExplorer: the CSP blocks an injected script, but nothing
    // stopped feed content from corrupting the table's markup.
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    // A feed row can arrive without a score or a timestamp. Rendering
    // "undefined" and "Invalid Date" into the ledger is worse than saying so.
    const score = (t) => Math.max(0, Math.min(100, Number(t.score) || 0));
    const seen = (t) => {
      const d = new Date(t.lastSeen);
      return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    };
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
                <button type="button" data-action="setProvider" data-provider="${esc(name)}"
                  class="flex flex-col gap-2 p-3 rounded-lg border transition-all text-left ${this.filter.provider === name ? 'bg-warning/20 border-warning shadow-lg shadow-warning/10' : 'bg-white/5 border-white/5 hover:border-white/20'}">
                  <div class="flex justify-between items-center">
                     <span class="eyebrow truncate" data-tone="strong">${esc(name)}</span>
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
                 ${this.filter.provider ? `<span class="pill" data-state="warn">${esc(this.filter.provider)}</span>` : ''}
              </div>
              <div class="flex items-center gap-4">
                 <div class="relative group">
                    <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-warning transition-colors">
                       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    </div>
                    <input type="text" value="${esc(this.filter.search)}" data-action="setSearch" data-on="input" 
                      class="bg-black/80 border border-white/10 rounded-lg pl-5 pr-4 py-3 mono-xs text-white focus:border-warning outline-none transition-all w-64 shadow-2xl" 
                      placeholder="SEARCH_HASHES..." />
                 </div>
              </div>
           </header>

           <div class="flex-grow overflow-y-auto custom-scrollbar">
              <table class="t-table table-fixed">
                 <thead>
                    <tr>
                       <th class="w-8 text-center">
                          <input type="checkbox" data-action="toggleSelectAll" data-on="change"
                            class="accent-warning" aria-label="Select every visible artifact" />
                       </th>
                       <th class="w-[40%]">Artifact indicator (SHA256 / pattern)</th>
                       <th class="w-[20%]">Malware family</th>
                       <th class="w-[12%]">Source</th>
                       <th class="w-[12%]">Risk</th>
                       <th class="w-[16%] text-right">Last observed</th>
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
                        return `<tr><td colspan="6"><div class="empty-state"><span class="eyebrow">No artifacts discovered</span></div></td></tr>`;
                      }
                      
                      return validArtifacts.map(t => `
                         <tr class="${this.selectedHashes.has(t.indicator) ? 'is-selected' : ''} ${t.blocked ? 'is-enforced' : ''}">
                            <td class="text-center">
                               <input type="checkbox" ${this.selectedHashes.has(t.indicator) ? 'checked' : ''}
                                 data-action="toggleSelect" data-on="change" data-indicator="${esc(t.indicator)}"
                                 class="accent-warning" aria-label="Select ${esc(t.indicator)}" />
                            </td>
                            <td>
                               <span class="cell-mono">${esc(t.indicator)}</span>
                            </td>
                            <td>
                               <span class="eyebrow">${esc(t.threatType)}</span>
                            </td>
                            <td>
                               <span class="eyebrow">${esc(t.provider)}</span>
                            </td>
                            <td>
                               <div class="cell-score">
                                  <span class="cell-mono">${esc(score(t))}</span>
                                  <span class="meter" data-state="${score(t) >= 85 ? 'crit' : 'warn'}" data-value="${score(t)}"></span>
                               </div>
                            </td>
                            <td class="text-right">
                               <span class="eyebrow">
                                  ${esc(seen(t))}
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
