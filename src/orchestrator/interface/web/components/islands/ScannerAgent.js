class ScannerAgent extends HTMLElement {
  constructor() {
    super();
    this.scanning = false;
    this.scanType = 'STANDARD';
  }
 
  connectedCallback() {
    this.render();
  }
 
  async syncSignatures() {
    try {
      const resultsEl = document.getElementById('scanner-results');
      if (resultsEl) {
        resultsEl.innerHTML = `
          <div class="flex flex-col items-center justify-center p-24 gap-6">
            <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div class="mono-xs font-black text-primary uppercase tracking-[0.4em]">Synchronizing_Global_Threat_Signatures...</div>
          </div>
        `;
      }
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/agents/scanner/sync-signatures', {
        method: 'POST',
        headers: { 'X-CT-Token': csrfToken }
      });
      const result = await res.json();
      if (resultsEl) {
        resultsEl.innerHTML = `
          <div class="t-panel glass-panel border-l-4 border-success p-8 animate-in zoom-in duration-500">
             <h4 class="mono-sm font-black text-success uppercase tracking-widest mb-4">SYNC_COMPLETE</h4>
             <pre class="mono-xs text-slate-500 bg-black/40 p-4 rounded border border-white/5 overflow-x-auto">${window.escapeHTML(result.message || 'Database updated successfully.')}</pre>
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
      const resultsEl = document.getElementById('scanner-results');
      if (resultsEl) {
        resultsEl.innerHTML = `
          <div class="flex flex-col items-center justify-center p-24 gap-6">
            <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            <div class="mono-xs font-black text-primary uppercase tracking-[0.4em]">Initializing_Scanner_Sidecar...</div>
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
      const result = await res.json();
      
      if (resultsEl) {
        const isClean = result.success && !result.threatsFound;
        const theme = isClean ? 'success' : 'danger';
        const color = `var(--${theme})`;
        
        resultsEl.innerHTML = `
          <div class="t-panel glass-panel border-l-4 animate-in zoom-in duration-500" style="border-left-color: ${color}">
             <div class="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                <div class="flex items-center gap-4">
                   <div class="dot active" style="background: ${color}"></div>
                   <h4 class="mono-sm font-black uppercase tracking-widest" style="color: ${color}">
                     ${isClean ? 'AUDIT_COMPLETE // CLEAN' : 'ANOMALY_DETECTED // CRITICAL'}
                   </h4>
                </div>
                <span class="mono-xs text-slate-700 font-bold uppercase tracking-widest">SID: ${Math.random().toString(36).slice(2, 8).toUpperCase()}</span>
             </div>
             
             <p class="mono-xs text-slate-400 mb-8 uppercase leading-relaxed tracking-tight font-bold">
               ${window.escapeHTML(result.summary || 'Full integrity audit completed. No malicious signatures identified in the target path.')}
             </p>
             
             <div class="bg-black/60 rounded p-6 border border-white/5 mono-xs text-slate-500 max-h-[300px] overflow-y-auto custom-scrollbar uppercase tracking-tighter leading-tight font-bold">
               <div class="text-slate-800 mb-4 border-b border-white/5 pb-2">RAW_AUDIT_MANIFEST</div>
               ${window.escapeHTML(result.message || 'No detailed log provided.')}
             </div>
             
             <div class="mt-8 flex justify-between items-center border-t border-white/5 pt-6">
                <div class="flex items-center gap-3">
                   <svg width="12" height="12" fill="none" stroke="var(--primary)" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                   <span class="mono-xs text-slate-600 uppercase font-black tracking-widest">Verification_SHA-256_ACTIVE</span>
                </div>
                <span class="mono-xs text-slate-700 uppercase font-bold">${new Date().toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
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
      <div class="space-y-8">
         <div class="bg-black/40 p-8 border border-white/5 rounded-2xl">
            <div class="flex justify-between items-center mb-10">
               <div class="flex flex-col gap-2">
                  <h3 class="tactical-title text-base tracking-widest">FILESYSTEM_ASSESSMENT</h3>
                  <p class="mono-xs text-slate-500 font-black uppercase tracking-widest">Deep signature scan & vulnerability discovery</p>
               </div>
                <div class="flex gap-4">
                   <div class="flex gap-4 p-1 bg-black/60 border border-white/10 rounded-xl">
                      ${['STANDARD', 'MALWARE', 'ROOTKIT'].map(type => `
                         <button class="px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${this.scanType === type ? 'bg-primary text-black' : 'text-slate-500 hover:text-slate-300'}" 
                                 onclick="this.closest('scanner-agent').setScanType('${type}')">
                            ${type}
                         </button>
                      `).join('')}
                   </div>
                   <button class="t-btn px-6 py-2 text-[9px] font-black uppercase tracking-widest border border-primary/20 hover:bg-primary/5" 
                           onclick="this.closest('scanner-agent').syncSignatures()">
                      Sync_Tactical_Signatures
                   </button>
                </div>
             </div>
            <button id="btn-run-scan" class="t-btn primary px-12 py-5 font-black uppercase tracking-widest w-full justify-center ${this.scanning ? 'opacity-50' : ''}" 
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
              <div class="p-24 text-center border-2 border-dashed border-white/5 rounded-2xl opacity-20">
                 <span class="mono-xs font-black uppercase tracking-[0.4em]">Awaiting_Scan_Trigger...</span>
              </div>
            `}
         </div>
      </div>
    `;
 
    const btn = this.querySelector('#btn-run-scan');
    if (btn && !this.scanning) {
       btn.onclick = () => this.runScan();
    }
  }
 
  setScanType(type) {
     this.scanType = type;
     this.render();
  }
}
customElements.define('scanner-agent', ScannerAgent);
