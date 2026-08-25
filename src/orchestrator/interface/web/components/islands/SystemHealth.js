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
    globalThis.addEventListener('metrics-update', (e) => {
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
           <div class="eyebrow p-4 text-center border border-dashed border-white/10 italic opacity-40">
              Auditing subsystem health...
           </div>
        </div>
      `;
      return;
    }

    // SEC-03: DOM-based XSS Hardening.
    // Transitioning from innerHTML template strings to safe DOM construction for dynamic content.
    this.innerHTML = `
      <div class="space-y-4">
        <div class="flex justify-between items-center mb-4 p-4 bg-black/60 border border-white/5 rounded-lg backdrop-blur-xl">
           <span class="eyebrow">Global Integrity</span>
           <span id="global-severity" class="status-pill tracking-[0.2em]"></span>
        </div>
        
        <div id="subsystem-grid" class="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-3">
        </div>
      </div>
    `;

    const sevEl = this.querySelector('#global-severity');
    sevEl.classList.add(severity.toLowerCase());
    sevEl.textContent = severity;

    const grid = this.querySelector('#subsystem-grid');
    subsystems.forEach(s => {
        const item = document.createElement('div');
        item.className = "flex justify-between items-center p-5 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.05] group transition-all";

        const left = document.createElement('div');
        left.className = "flex items-center gap-5";

        const dot = document.createElement('div');
        dot.className = `w-2 h-2 rounded-full ${this.getSeverityColor(s.status).replace('text-', 'bg-')} shadow-[0_0_8px_currentColor]`;

        const nameSpan = document.createElement('span');
        nameSpan.className = "mono-xs font-black text-slate-300 uppercase tracking-widest";
        nameSpan.textContent = s.name.replace(/_/g, ' ');

        left.appendChild(dot);
        left.appendChild(nameSpan);

        const right = document.createElement('div');
        right.className = "flex flex-col items-end gap-1";

        const statusSpan = document.createElement('span');
        statusSpan.className = `mono-xs font-black ${this.getSeverityColor(s.status)} tracking-widest`;
        statusSpan.textContent = s.status;

        right.appendChild(statusSpan);

        if (s.error) {
            const errorSpan = document.createElement('span');
            errorSpan.className = "text-[8px] text-danger/80 font-mono truncate max-w-[150px] italic";
            errorSpan.title = s.error;
            errorSpan.textContent = s.error;
            right.appendChild(errorSpan);
        }

        item.appendChild(left);
        item.appendChild(right);
        grid.appendChild(item);
    });
  }
}

if (!customElements.get('system-health')) {
  customElements.define('system-health', SystemHealth);
}
