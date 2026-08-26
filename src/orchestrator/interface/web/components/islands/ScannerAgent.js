import { unwrap } from "./api.js";
import { bindActions } from "./actions.js";
class ScannerAgent extends HTMLElement {
  constructor() {
    super();
    this.scanning = false;
    this.scanType = 'STANDARD';
  }
 
  connectedCallback() {
    // Delegated, because an inline onclick is refused under the CSP.
    bindActions(this, {
      setScanType: (el) => this.setScanType(el.dataset.value),
      syncSignatures: () => this.syncSignatures(),
    });
    this.render();
    this.fetchLedger();
    this.interval = setInterval(() => this.fetchLedger(), 30000);
  }

  disconnectedCallback() {
    if (this.interval) clearInterval(this.interval);
  }

  async fetchLedger() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const headers = csrfToken ? { 'X-CT-Token': csrfToken } : {};
      const res = await fetch('/api/agents/scanner/ledger', { headers });
      if (!res.ok) return;
      const ledger = await unwrap(res);
      this.ledger = ledger;
      this.renderLedger(ledger);
    } catch (e) {
      console.error('Ledger fetch failed:', e);
    }
  }

  renderLedger(ledger) {
    const esc = globalThis.escapeHTML ?? ((v) => String(v));
    // item.score reaches a style attribute; a feed-supplied string there is a
    // CSS injection, so clamp it to a number rather than only escaping it.
    const score = (item) => Math.max(0, Math.min(100, Number(item.score) || 0));
    const listEl = this.querySelector('#scanner-ledger');
    if (!listEl) return;

    if (!ledger || ledger.length === 0) {
      listEl.innerHTML = `
        <div class="p-5 text-center t-panel glass-panel border-dashed opacity-50">
          <span class="eyebrow italic">No Critical Artifacts Identified</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = ledger.map(item => `
      <div class="flex justify-between items-center p-4 bg-black/40 border border-white/5 group hover:border-danger/30 rounded transition-colors">
        <div class="flex flex-col gap-1 overflow-hidden">
           <span class="eyebrow">${globalThis.escapeHTML(item.threatType || 'MALICIOUS_ARTIFACT')}</span>
           <span class="mono-sm font-black text-danger uppercase tracking-widest truncate">${globalThis.escapeHTML(item.indicator.slice(0, 32))}...</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="flex flex-col items-end">
              <span class="mono-xs text-slate-700 font-bold">${esc(score(item))}%</span>
              <span class="meter" data-state="crit" style="--value:${score(item)}%"></span>
           </div>
           <div class="dot danger"></div>
        </div>
      </div>
    `).join('');
  }
 
  async syncSignatures() {
    try {
      const resultsEl = this.querySelector('#scanner-results');
      if (resultsEl) {
        resultsEl.innerHTML = `
          <div class="flex flex-col items-center justify-center p-6 gap-4">
            <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div class="eyebrow" data-tone="primary">Synchronizing_Global_Threat_Signatures...</div>
          </div>
        `;
      }
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/agents/scanner/sync-signatures', {
        method: 'POST',
        headers: {
          'X-CT-Token': csrfToken || ''
        }
      });
      const result = await unwrap(res);
      if (resultsEl) {
        resultsEl.innerHTML = `
          <div class="t-panel glass-panel border-l-4 border-success p-4 animate-in zoom-in duration-500">
             <h4 class="mono-sm font-black text-success uppercase tracking-widest mb-4">SYNC_COMPLETE</h4>
             <pre class="mono-xs text-slate-500 bg-black/40 p-4 rounded border border-white/5 overflow-x-auto">${globalThis.escapeHTML(result.message || 'Database updated successfully.')}</pre>
          </div>
        `;
      }
    } catch (e) {
      console.error('Sync failed:', e);
    }
  }

  async runScan() {
    if (this.scanning) return;
    this.scanning = true;
    this.render();
 
    try {
      const resultsEl = this.querySelector('#scanner-results');
      if (resultsEl) {
        resultsEl.innerHTML = `
          <div class="flex flex-col items-center justify-center p-6 gap-4">
            <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div class="eyebrow" data-tone="primary">Initializing_Scanner_Sidecar...</div>
            <div class="w-full max-w-xs h-1 bg-white/5 rounded-full overflow-hidden">
               <div class="h-full bg-primary animate-progress"></div>
            </div>
          </div>
        `;
      }
 
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/agents/scanner/scan', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CT-Token': csrfToken || ''
        },
        body: JSON.stringify({ 
          path: '/home/',
          type: this.scanType 
        })
      });
      const result = await unwrap(res);
      
      if (resultsEl) {
        const isClean = result.success && !result.threatsFound;
        const theme = isClean ? 'success' : 'danger';
        const color = `var(--${theme})`;
        
        resultsEl.innerHTML = `
          <div class="t-panel glass-panel border-l-4 animate-in zoom-in duration-500" style="border-left-color: ${color}">
             <div class="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <div class="flex items-center gap-4">
                   <div class="dot active" style="background: ${color}"></div>
                   <h4 class="mono-sm font-black uppercase tracking-widest" style="color: ${color}">
                     ${isClean ? 'AUDIT_COMPLETE // CLEAN' : 'ANOMALY_DETECTED // CRITICAL'}
                   </h4>
                </div>
                <span class="eyebrow">SID: ${Math.random().toString(36).slice(2, 8).toUpperCase()}</span>
             </div>
             
             <p class="mono-xs text-slate-400 mb-4 uppercase leading-relaxed tracking-tight font-bold">
               ${globalThis.escapeHTML(result.summary || 'Full integrity audit completed. No malicious signatures identified in the target path.')}
             </p>
             
             <div class="bg-black/60 rounded p-4 border border-white/5 mono-xs text-slate-500 max-h-[300px] overflow-y-auto custom-scrollbar uppercase tracking-tighter leading-tight font-bold">
               <div class="text-slate-800 mb-4 border-b border-white/5 pb-2">RAW_AUDIT_MANIFEST</div>
               ${globalThis.escapeHTML(result.message || 'No detailed log provided.')}
             </div>
             
             <div class="mt-4 flex justify-between items-center border-t border-white/5 pt-4">
                <div class="flex items-center gap-3">
                   <svg width="12" height="12" fill="none" stroke="var(--primary)" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                   <span class="eyebrow">Verification_SHA-256_ACTIVE</span>
                </div>
                <span class="eyebrow">${new Date().toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
             </div>
          </div>
        `;
      }
    } catch (e) {
      console.error('Scan failed:', e);
    } finally {
      this.scanning = false;
      this.render();
    }
  }
 
  render() {
    this.innerHTML = `
      <div class="space-y-4">
         <div class="bg-black/40 p-4 border border-white/5 rounded-lg">
            <div class="flex justify-between items-center mb-5">
               <div class="flex flex-col gap-2">
                  <h3 class="tactical-title text-base tracking-widest">FILESYSTEM_ASSESSMENT</h3>
                  <p class="eyebrow">Deep signature scan & vulnerability discovery</p>
               </div>
                <div class="flex gap-4">
                   <div class="tab-group" role="group" aria-label="Scan profile">
                      ${['STANDARD', 'MALWARE', 'ROOTKIT'].map(type => `
                         <button type="button" class="mode-btn" data-action="setScanType" data-value="${type}"
                                 aria-pressed="${this.scanType === type}">
                            ${type}
                         </button>
                      `).join('')}
                   </div>
                   <button type="button" class="btn btn--sm" data-action="syncSignatures">
                      Sync_Tactical_Signatures
                   </button>
                </div>
             </div>
            <button id="btn-run-scan" class="t-btn primary px-5 py-3 font-black uppercase tracking-widest w-full justify-center ${this.scanning ? 'opacity-50' : ''}" 
                    ${this.scanning ? 'disabled' : ''}>
               ${this.scanning ? `
                 <svg class="animate-spin -ml-1 mr-3 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                   <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                   <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                 </svg>
                 Auditing_Filesystem...
               ` : 'Execute_Full_Audit'}
            </button>
         </div>
         
         <div id="scanner-results">
            ${this.scanning ? '' : `
              <div class="p-6 text-center border-2 border-dashed border-white/5 rounded-lg opacity-20">
                 <span class="eyebrow">Awaiting_Scan_Trigger...</span>
              </div>
            `}
         </div>

         <section class="flex flex-col gap-3">
            <span class="eyebrow eyebrow--tick eyebrow--rule">Critical Artifact Ledger</span>
            <div id="scanner-ledger" class="flex flex-col gap-2"></div>
         </section>
      </div>
    `;
 
    const btn = this.querySelector('#btn-run-scan');
    if (btn && !this.scanning) {
       btn.onclick = () => this.runScan();
    }
    // render() rewrites innerHTML, which drops the ledger; repaint it.
    if (this.ledger) this.renderLedger(this.ledger);
  }
 
  setScanType(type) {
     this.scanType = type;
     this.render();
  }
}
customElements.define('scanner-agent', ScannerAgent);
