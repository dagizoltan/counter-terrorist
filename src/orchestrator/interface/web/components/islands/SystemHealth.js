/**
 * Custom Element: SystemHealth
 * Real-time monitoring of background subsystem operational status.
 */
class SystemHealth extends HTMLElement {
  constructor() {
    super();
    this.health = { severity: 'UNKNOWN', subsystems: [] };
  }

  connectedCallback() {
    this.render();
    this.setupListeners();
  }

  setupListeners() {
    window.addEventListener('metrics-update', (e) => {
      if (e.detail?.health) {
        this.health = e.detail.health;
        this.render();
      }
    });
  }

  getSeverityColor(status) {
    switch (status) {
      case 'OPERATIONAL': return 'text-success';
      case 'BOOTING': return 'text-warning';
      case 'DEGRADED': return 'text-warning';
      case 'FAILED': return 'text-danger';
      default: return 'text-slate-500';
    }
  }

  render() {
    const { severity, subsystems } = this.health;
    
    if (subsystems.length === 0) {
      this.innerHTML = `
        <div class="flex flex-col gap-4">
           <div class="skeleton h-12 w-full"></div>
           <div class="skeleton h-12 w-full opacity-60"></div>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center mb-6 p-4 bg-black/40 border border-white/5 rounded-lg">
           <span class="mono-xs text-slate-500 uppercase tracking-widest">Global_Integrity</span>
           <span class="status-pill ${severity.toLowerCase()}">${severity}</span>
        </div>
        
        <div class="grid grid-cols-1 gap-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
          ${subsystems.map(s => `
            <div class="flex justify-between items-center p-4 bg-white/[0.02] border border-white/5 rounded hover:bg-white/[0.04] group">
               <div class="flex items-center gap-4">
                  <div class="w-1.5 h-1.5 rounded-full ${this.getSeverityColor(s.status).replace('text-', 'bg-')}"></div>
                  <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">${s.name}</span>
               </div>
               <div class="flex flex-col items-end">
                  <span class="mono-xs font-bold ${this.getSeverityColor(s.status)}">${s.status}</span>
                  ${s.error ? `<span class="text-[8px] text-danger/60 mono truncate max-w-[120px]" title="${s.error}">${s.error}</span>` : ''}
               </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

customElements.define('system-health', SystemHealth);
