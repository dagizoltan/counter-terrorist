/**
 * Custom Element: StatusIndicator
 * Refactored to use Global Tactical Design System
 */
class StatusIndicator extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.updateStatus();
    this.interval = setInterval(() => this.updateStatus(), 30000);
  }

  disconnectedCallback() {
    if (this.interval) clearInterval(this.interval);
  }

  async updateStatus() {
    const name = this.getAttribute('name') || 'Unknown Agent';
    
    try {
      let isOnline = false;
      const res = await fetch('/api/agent/status');
      if (res.ok) {
        const data = await res.json();
        if (name === "Active Blocker") isOnline = data.firewall?.active;
        else if (name === "Network Sensor") isOnline = data.ebpf?.active;
        else if (name === "Persistence Monitor") isOnline = data.fim?.active;
      }
      this.render(name, isOnline ? 'ONLINE' : 'OFFLINE', isOnline ? 'var(--success)' : 'var(--danger)');
    } catch (e) {
      this.render(name, 'ERROR', 'var(--danger)');
    }
  }

  render(name, status, color) {
    this.innerHTML = `
      <div class="flex justify-between items-center py-3 border-b border-white/5 group">
        <span class="mono text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">${name}</span>
        <div class="flex items-center gap-2">
           <span class="dot" style="background: ${color}; box-shadow: 0 0 10px ${color}88;"></span>
           <span class="mono text-[9px] font-black uppercase tracking-widest" style="color: ${color}">${status}</span>
        </div>
      </div>
    `;
  }
}

customElements.define('status-indicator', StatusIndicator);
