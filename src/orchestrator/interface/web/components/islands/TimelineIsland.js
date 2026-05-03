/**
 * TimelineIsland
 * Authoritative forensic reconstruction of system events.
 * Implements high-performance virtualization for deep audit histories.
 */
class TimelineIsland extends HTMLElement {
  constructor() {
    super();
    this.events = [];
    this.isHydrating = true;
    this.visibleCount = 20;
    this.scrollListener = null;
    
    // Safety: Define escape utility
    this.escape = (str) => {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };
  }

  connectedCallback() {
    this.fetchTimeline();
    this.interval = setInterval(() => this.fetchTimeline(), 15000);
    
    // Virtualization: Bind scroll listener to window
    this.scrollListener = () => this.handleScroll();
    window.addEventListener('scroll', this.scrollListener, { passive: true });
  }

  disconnectedCallback() {
    if (this.interval) clearInterval(this.interval);
    if (this.scrollListener) window.removeEventListener('scroll', this.scrollListener);
  }

  async fetchTimeline() {
    try {
      const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
      const res = await fetch('/api/audit?limit=500', {
        headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
      });
      if (res.ok) {
        const data = await res.json();
        // Update if data length changed or hashes differ
        if (data.length !== this.events.length || (data.length > 0 && data[0].hash !== this.events[0]?.hash)) {
          this.events = data;
          this.isHydrating = false;
          this.render();
          this.updateStats();
        }
      }
    } catch (e) {
      console.error("[TIMELINE] Hydration failed", e);
    }
  }

  handleScroll() {
    const container = document.getElementById('timeline-events');
    if (!container || this.events.length <= this.visibleCount) return;

    const rect = container.getBoundingClientRect();
    // Load more if we're close to the bottom of the container
    const isNearBottom = rect.bottom < window.innerHeight + 1000;

    if (isNearBottom && this.visibleCount < this.events.length) {
      this.visibleCount += 25;
      this.render();
    }
  }

  updateStats() {
    const modeEl = document.getElementById('timeline-mode');
    const totalEl = document.getElementById('timeline-total');
    const criticalEl = document.getElementById('timeline-critical');
    const blocksEl = document.getElementById('timeline-blocks');
    const progressEl = document.getElementById('timeline-progress');
    const markersEl = document.getElementById('timeline-markers');

    if (modeEl) {
      const hasEvents = this.events.length > 0;
      modeEl.textContent = hasEvents ? 'BUFFER_SYNCHRONIZED' : 'BUFFER_EMPTY';
      modeEl.className = `mono-xs font-black tracking-[0.2em] uppercase transition-colors ${hasEvents ? 'text-primary' : 'text-danger'}`;
      const dot = modeEl.previousElementSibling;
      if (dot) {
        dot.className = `dot ${hasEvents ? 'active shadow-primary' : 'danger pulse shadow-danger'}`;
      }
    }
    
    if (totalEl) totalEl.textContent = this.events.length.toString().padStart(3, '0');
    if (criticalEl) criticalEl.textContent = this.events.filter(e => e.type === 'CRITICAL' || (e.severity >= 8)).length.toString().padStart(3, '0');
    if (blocksEl) blocksEl.textContent = this.events.filter(e => e.type === 'BLOCK').length.toString().padStart(3, '0');
    if (progressEl) progressEl.style.width = '100%';

    if (markersEl) {
      const critEvents = this.events.filter(e => e.type === 'CRITICAL' || e.type === 'BLOCK' || (e.severity >= 5));
      const now = Date.now();
      const windowMs = 24 * 60 * 60 * 1000;
      markersEl.innerHTML = critEvents.slice(0, 50).map(e => {
        const ts = new Date(e.timestamp).getTime();
        const pct = Math.max(0, Math.min(100, ((ts - (now - windowMs)) / windowMs) * 100));
        const theme = (e.type === 'CRITICAL' || e.severity >= 8) ? 'danger' : 'warning';
        const color = `var(--${theme})`;
        return `<div class="absolute w-[3px] h-6 rounded-full transition-all hover:h-8 hover:w-[5px]" style="left:${pct}%; background:${color}; box-shadow:0 0 15px ${color}" title="${this.escape(e.message)}"></div>`;
      }).join('');
    }
  }

  render() {
    const container = document.getElementById('timeline-events');
    if (!container) return;

    if (this.isHydrating && this.events.length === 0) {
      container.innerHTML = `
        <div class="t-panel glass-panel text-center p-32 border-dashed opacity-30">
           <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-primary mx-auto mb-8"></div>
           <span class="mono-xs font-black uppercase tracking-[0.4em] animate-pulse text-primary">Reconstructing_Event_Horizon...</span>
        </div>
      `;
      return;
    }

    if (this.events.length === 0) {
      container.innerHTML = `
        <div class="t-panel glass-panel text-center p-32 border-dashed opacity-20">
           <span class="mono-xs font-black uppercase tracking-widest text-slate-500 italic">No_Security_Events_Found_In_Temporal_Buffer</span>
        </div>
      `;
      return;
    }

    const eventsToRender = this.events.slice(0, this.visibleCount);
    container.innerHTML = eventsToRender.map(ev => this.renderEvent(ev)).join('');
    
    if (this.visibleCount < this.events.length) {
      const loadMore = document.createElement('div');
      loadMore.className = 'py-16 text-center opacity-30';
      loadMore.innerHTML = `<span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em] animate-pulse">Scanning_Older_Segments_(${this.events.length - this.visibleCount}_Remaining)...</span>`;
      container.appendChild(loadMore);
    }
  }

  renderEvent(ev) {
    const isCritical = ev.type === 'CRITICAL' || ev.severity >= 8;
    const isWarning = ev.type === 'BLOCK' || ev.type === 'WARN' || (ev.severity >= 5 && ev.severity < 8);
    const theme = isCritical ? 'danger' : (isWarning ? 'warning' : 'primary');
    const color = `var(--${theme})`;
    
    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'}) : '00:00:00';
    let nodeName = 'LOCAL_NODE';
    let msg = ev.message || 'NULL_SIGNAL_DETECTED';
    
    if (msg.startsWith('[REMOTE:')) {
       const endIdx = msg.indexOf(']');
       if (endIdx !== -1) {
           nodeName = msg.substring(8, endIdx).toUpperCase();
           msg = msg.substring(endIdx + 1).trim();
       }
    }

    return `
      <div class="t-panel glass-panel border-l-4 group transition-all hover:bg-white/[0.03] hover:translate-x-2 animate-fade-in p-8 mb-6" style="border-left-color: ${color}">
        <div class="flex justify-between items-start mb-8">
           <div class="flex items-center gap-8">
              <div class="flex flex-col gap-1">
                 <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">Timestamp</span>
                 <span class="mono text-lg font-black text-white tabular-nums tracking-tighter">${ts}</span>
              </div>
              <span class="text-slate-800 font-bold opacity-30 text-2xl">//</span>
              <div class="flex flex-col gap-1">
                 <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">Source_Node</span>
                 <div class="flex items-center gap-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" opacity="0.6"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    <span class="mono-xs font-black text-primary tracking-widest uppercase shadow-primary">${this.escape(nodeName)}</span>
                 </div>
              </div>
           </div>
           <div class="flex items-center gap-4 bg-black/40 px-4 py-2 rounded border border-white/5 shadow-inner">
              <span class="dot active shadow-${theme}" style="background: ${color}"></span>
              <span class="mono-xs font-black uppercase tracking-[0.2em]" style="color: ${color}">${this.escape(ev.type || 'EVENT')}</span>
           </div>
        </div>
        <h4 class="text-2xl font-black text-white uppercase tracking-tighter mb-6 group-hover:text-primary transition-colors leading-tight">${this.escape(msg)}</h4>
        ${ev.data ? `
          <div class="p-6 bg-black/60 border border-white/5 rounded-lg font-mono text-[11px] text-primary/60 break-all select-all opacity-40 group-hover:opacity-100 transition-opacity relative group/data">
            <div class="absolute top-4 right-4 mono-xs text-slate-800 font-black opacity-0 group-hover/data:opacity-100 transition-opacity uppercase tracking-widest">Raw_Telemetry</div>
            <pre class="whitespace-pre-wrap leading-relaxed">${this.escape(typeof ev.data === 'string' ? ev.data : JSON.stringify(ev.data, null, 2))}</pre>
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('timeline-island', TimelineIsland);
