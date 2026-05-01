class AgentDetail extends HTMLElement {
  connectedCallback() {
    const agentName = this.getAttribute('data-agent');
    if (agentName) this.fetchStatus(agentName);
  }

  async fetchStatus(name) {
    try {
      const res = await fetch('/api/agent/status');
      if (!res.ok) return;
      const data = await res.json();

      // Update health
      const healthEl = document.getElementById(`agent-health-${name}`);
      if (healthEl) {
        const isActive = data[name]?.active !== false;
        healthEl.textContent = isActive ? 'OPERATIONAL' : 'INACTIVE';
        healthEl.className = isActive ? 'text-green-500' : 'text-red-500';
      }

      // Update PID  
      const pidEl = document.getElementById(`agent-pid-${name}`);
      if (pidEl) {
        pidEl.textContent = data[name]?.pid ? `PID_${data[name].pid}` : 'N/A';
      }

      // Update capabilities
      const capsEl = document.getElementById(`agent-caps-${name}`);
      if (capsEl) {
        const caps = data[name]?.capabilities || ['STANDARD'];
        capsEl.innerHTML = caps.map(c => 
          `<span class="px-2 py-0.5 bg-white/10 text-[9px] font-black uppercase">${c}</span>`
        ).join('');
      }

      // Update privilege
      const privEl = document.getElementById(`agent-priv-${name}`);
      if (privEl) {
        const isRoot = data[name]?.root === true;
        privEl.textContent = isRoot ? 'ROOT_ACCESS' : 'USER_LEVEL';
        privEl.className = isRoot ? 'text-yellow-500' : 'text-green-500';
      }
    } catch (e) {
      console.error('Failed to load agent details:', e);
    }
  }
}
customElements.define('agent-detail', AgentDetail);
