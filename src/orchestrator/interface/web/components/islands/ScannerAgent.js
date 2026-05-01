class ScannerAgent extends HTMLElement {
  constructor() {
    super();
    this.scanning = false;
  }

  connectedCallback() {
    this.render();
  }

  async runScan() {
    if (this.scanning) return;
    this.scanning = true;
    this.render();

    try {
      const res = await fetch('/api/agents/scanner/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: '/home/' })
      });
      const result = await res.json();
      
      const resultsEl = document.getElementById('scanner-results');
      if (resultsEl) {
        const isClean = result.success && !result.threatsFound;
        const statusTitle = isClean ? 'Scan_Complete // Clean' : 'Threat_Detected // Alert';
        const statusColor = isClean ? 'emerald' : 'danger';
        
        resultsEl.innerHTML = `
          <div class="p-4 bg-${statusColor}-500/10 border border-${statusColor}-500/20 rounded-xl mb-4">
             <p class="text-[10px] font-black text-${statusColor}-500 uppercase mb-2">${statusTitle}</p>
             <p class="text-[9px] text-slate-400 mb-4">${result.summary || 'Full integrity audit completed. No malicious signatures identified in the target path.'}</p>
             <div class="bg-black/60 p-4 rounded border border-white/5 font-mono text-[8px] text-slate-500 max-h-[200px] overflow-y-auto whitespace-pre">
${result.message}
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
    const btn = document.getElementById('btn-run-scan');
    if (btn) {
      btn.disabled = this.scanning;
      btn.innerHTML = this.scanning ? 'Scanning...' : 'Execute_Full_System_Scan';
      if (!this.scanning && !btn.onclick) {
        btn.onclick = () => this.runScan();
      }
    }
  }
}
customElements.define('scanner-agent', ScannerAgent);
