class TimelineIsland extends HTMLElement {
  connectedCallback() {
    this.fetchTimeline();
  }

  async fetchTimeline() {
    try {
      const res = await fetch('/api/audit?limit=100');
      if (!res.ok) return;
      const events = await res.json();
      this.renderEvents(events);
    } catch (e) {
      console.error('Failed to load timeline:', e);
    }
  }

  renderEvents(events) {
    const container = document.getElementById('timeline-events');
    const modeEl = document.getElementById('timeline-mode');
    const totalEl = document.getElementById('timeline-total');
    const criticalEl = document.getElementById('timeline-critical');
    const blocksEl = document.getElementById('timeline-blocks');
    const progressEl = document.getElementById('timeline-progress');

    if (!container) return;

    if (modeEl) modeEl.textContent = events.length > 0 ? 'LIVE_DATA' : 'NO_EVENTS';
    if (totalEl) totalEl.textContent = events.length;
    if (criticalEl) criticalEl.textContent = events.filter(e => e.type === 'CRITICAL').length;
    if (blocksEl) blocksEl.textContent = events.filter(e => e.type === 'BLOCK').length;
    if (progressEl) progressEl.style.width = '100%';

    if (events.length === 0) {
      container.innerHTML = `
        <div class="bg-white/5 border border-white/5 p-6 text-center text-slate-500 text-[10px] font-bold uppercase">
          No audit events recorded yet. System is clean.
        </div>`;
      return;
    }

    // Render timeline markers
    const markersEl = document.getElementById('timeline-markers');
    if (markersEl) {
      const critEvents = events.filter(e => e.type === 'CRITICAL' || e.type === 'BLOCK');
      const now = Date.now();
      const windowMs = 24 * 60 * 60 * 1000;
      markersEl.innerHTML = critEvents.slice(0, 10).map(e => {
        const ts = new Date(e.timestamp).getTime();
        const pct = Math.max(0, Math.min(100, ((ts - (now - windowMs)) / windowMs) * 100));
        const color = e.type === 'CRITICAL' ? 'bg-red-500' : 'bg-yellow-500';
        return `<div class="absolute w-1 h-3 ${color}" style="left:${pct}%" title="${e.message}"></div>`;
      }).join('');
    }

    container.innerHTML = events.slice(0, 50).map(ev => {
      const severity = ev.type;
      const borderColor = severity === 'CRITICAL' ? 'border-red-600' : severity === 'BLOCK' ? 'border-orange-500' : severity === 'WARN' ? 'border-yellow-500' : 'border-slate-700';
      const typeColor = severity === 'CRITICAL' ? 'text-red-500' : severity === 'BLOCK' ? 'text-orange-500' : severity === 'WARN' ? 'text-yellow-500' : 'text-slate-500';
      const opacity = severity === 'INFO' ? 'opacity-60' : '';
      const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';
      
      let nodeName = 'LOCAL';
      let msg = ev.message || 'No message';
      
      if (msg.startsWith('[REMOTE:')) {
         const endIdx = msg.indexOf(']');
         if (endIdx !== -1) {
             nodeName = msg.substring(8, endIdx);
             msg = msg.substring(endIdx + 1).trim();
         }
      }
      
      return \`
        <div class="bg-white/5 border border-white/5 p-6 border-l-4 \${borderColor} \${opacity}">
           <div class="flex justify-between mb-2">
              <span class="text-[10px] font-black text-slate-500">\${ts} // \${nodeName}</span>
              <span class="text-[10px] font-black \${typeColor} uppercase">\${severity}</span>
           </div>
           <p class="text-sm font-bold uppercase tracking-tight">\${this.escapeHtml(msg)}</p>
           \${ev.data ? \`<div class="mt-2 text-[9px] text-slate-600 font-mono truncate">\${this.escapeHtml(typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data))}</div>\` : ''}
        </div>
      \`;
    }).join('');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
customElements.define('timeline-island', TimelineIsland);
