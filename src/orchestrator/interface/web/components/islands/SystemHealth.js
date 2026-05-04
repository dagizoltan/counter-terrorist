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
        <div class="flex flex-col gap-6">
           <div class="p-8 text-center border border-dashed border-white/10 mono-xs uppercase tracking-widest italic opacity-40">
              Auditing subsystem health...
           </div>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="space-y-6">
        <div class="flex justify-between items-center mb-8 p-6 bg-black/60 border border-white/5 rounded-2xl backdrop-blur-xl">
           <span class="mono-xs text-slate-400 font-black uppercase tracking-widest">Global Integrity</span>
           <span class="status-pill ${window.escapeHTML(severity.toLowerCase())} !px-6 !py-2 text-[10px] tracking-[0.2em]">${window.escapeHTML(severity)}</span>
        </div>
        
        <div class="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-3">
          ${subsystems.map(s => {
            const name = window.escapeHTML(s.name).replace(/_/g, ' ');
            return `
              <div class="flex justify-between items-center p-5 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.05] group transition-all">
                 <div class="flex items-center gap-5">
                    <div class="w-2 h-2 rounded-full ${this.getSeverityColor(s.status).replace('text-', 'bg-')} shadow-[0_0_8px_currentColor]"></div>
                    <span class="mono-xs font-black text-slate-300 uppercase tracking-widest">${name}</span>
                 </div>
                 <div class="flex flex-col items-end gap-1">
                    <span class="mono-xs font-black ${this.getSeverityColor(s.status)} tracking-widest">${window.escapeHTML(s.status)}</span>
                    ${s.error ? `<span class="text-[8px] text-danger/80 font-mono truncate max-w-[150px] italic" title="${window.escapeHTML(s.error)}">${window.escapeHTML(s.error)}</span>` : ''}
                 </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }
}

if (!customElements.get('system-health')) {
  customElements.define('system-health', SystemHealth);
}
