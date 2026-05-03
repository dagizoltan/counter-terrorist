/**
 * NewsFeed Island
 * Visualizes latest cybersecurity tactical signals from RSS feeds.
 */
class NewsFeed extends HTMLElement {
    constructor() {
        super();
        this.signals = [];
    }

    connectedCallback() {
        this.renderBase();
        this.fetchSignals();
        this.interval = setInterval(() => this.fetchSignals(), 300000); // 5 mins
    }

    disconnectedCallback() {
        if (this.interval) clearInterval(this.interval);
    }

    async fetchSignals() {
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            const res = await fetch('/api/autopilot/news', {
              headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
            });
            if (res.ok) {
                this.signals = await res.json();
                this.render();
            }
        } catch (e) {
            console.warn('[NEWS-FEED] Failed to fetch signals', e);
        }
    }

    renderBase() {
        this.innerHTML = `
            <div class="space-y-6" id="news-container">
                <div class="p-16 text-center border border-dashed border-white/5 opacity-30 rounded">
                    <span class="mono-xs font-black text-primary animate-pulse uppercase tracking-[0.4em]">Synchronizing_Tactical_Signals...</span>
                </div>
            </div>
        `;
    }

    render() {
        const container = this.querySelector('#news-container');
        if (!this.signals || this.signals.length === 0) {
            container.innerHTML = `
                <div class="p-16 text-center border border-dashed border-white/10 opacity-50 rounded">
                    <div class="mono-xs font-black uppercase tracking-widest mb-3 italic text-slate-500">No_Signals_In_Buffer</div>
                    <div class="mono-xs text-slate-600 font-bold uppercase">Defense Mesh is awaiting threat intelligence ingestion.</div>
                </div>`;
            return;
        }

        container.innerHTML = this.signals.map(item => `
            <a href="${window.escapeHTML(item.link)}" target="_blank" class="t-panel glass-panel block group no-underline transition-all hover:bg-white/[0.03] hover:translate-x-1 p-6 border-l-2 border-slate-800 hover:border-primary">
                <div class="flex justify-between items-center mb-4">
                    <div class="flex items-center gap-2">
                       <svg width="10" height="10" fill="none" stroke="var(--primary)" viewBox="0 0 24 24" stroke-width="3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                       <span class="mono-xs font-black text-primary uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100 transition-opacity">${window.escapeHTML(item.source)}</span>
                    </div>
                    <span class="mono-xs text-slate-600 font-bold uppercase tabular-nums">${new Date(item.timestamp).toLocaleTimeString([], {hour12:false, hour:'2-digit', minute:'2-digit'})}</span>
                </div>
                <h4 class="text-lg font-black text-white mb-3 leading-tight group-hover:text-primary transition-colors uppercase tracking-tighter">${window.escapeHTML(item.title)}</h4>
                <p class="mono-xs font-bold text-slate-500 leading-relaxed group-hover:text-slate-300 transition-colors uppercase tracking-tight">${window.escapeHTML(item.summary).slice(0, 140)}...</p>
                <div class="mt-6 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                       <div class="dot active shadow-primary"></div>
                       <span class="mono-xs font-black text-slate-700 uppercase tracking-widest group-hover:text-primary transition-colors">Analyze_Vector</span>
                    </div>
                    <span class="mono-xs text-slate-800 font-bold">SOURCE_AUDIT_OK</span>
                </div>
            </a>
        `).join('');
    }
}

customElements.define('news-feed', NewsFeed);
