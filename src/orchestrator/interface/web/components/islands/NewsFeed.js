/**
 * Custom Element: NewsFeed
 * Enhanced tactical aggregator for real-time cyber intelligence.
 */
class NewsFeed extends HTMLElement {
  constructor() {
    super();
    this.news = [];
    this.currentIndex = 0;
  }

  connectedCallback() {
    this.render();
    this.setupListeners();
    this.startTicker();
  }

  setupListeners() {
    window.addEventListener('metrics-update', (e) => {
      if (e.detail?.news?.latest) {
        this.news = e.detail.news.latest.map(item => ({
          ...item,
          severity: this.calculateSeverity(item.title),
          category: this.detectCategory(item.title)
        }));
        this.render();
      }
    });
  }

  calculateSeverity(title) {
    const critical = ['exploit', 'critical', 'zero-day', 'ransomware', 'breach'];
    const high = ['vulnerability', 'phishing', 'campaign', 'targeted'];
    const lower = title.toLowerCase();
    if (critical.some(word => lower.includes(word))) return 'CRITICAL';
    if (high.some(word => lower.includes(word))) return 'HIGH';
    return 'INFO';
  }

  detectCategory(title) {
    const lower = title.toLowerCase();
    if (lower.includes('phish')) return 'PHISHING';
    if (lower.includes('vulnerabilit') || lower.includes('cve')) return 'EXPLOIT';
    if (lower.includes('malware') || lower.includes('ransom')) return 'MALWARE';
    return 'INTEL';
  }

  startTicker() {
    setInterval(() => {
      if (this.news.length > 0) {
        this.currentIndex = (this.currentIndex + 1) % this.news.length;
        const ticker = this.querySelector('#breaking-signal-text');
        if (ticker) {
          ticker.style.opacity = '0';
          setTimeout(() => {
            ticker.innerText = this.news[this.currentIndex].title;
            ticker.style.opacity = '1';
          }, 500);
        }
      }
    }, 8000);
  }

  getSeverityStyles(sev) {
    switch (sev) {
      case 'CRITICAL': return 'bg-danger/20 text-danger border-danger/40 shadow-danger/20';
      case 'HIGH': return 'bg-warning/20 text-warning border-warning/40 shadow-warning/20';
      default: return 'bg-primary/20 text-primary border-primary/40 shadow-primary/20';
    }
  }

  getCategoryIcon(cat) {
    switch (cat) {
      case 'EXPLOIT': return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L22 22"/></svg>';
      case 'PHISHING': return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12l4 4-4 4"/></svg>';
      case 'MALWARE': return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
      default: return '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }
  }

  render() {
    const isDetailed = this.getAttribute('detailed') === 'true';
    const limit = parseInt(this.getAttribute('limit') || (isDetailed ? '50' : '12'));
    const displayNews = this.news.slice(0, limit);

    if (this.news.length === 0) {
      this.innerHTML = `
        <div class="flex flex-col gap-6">
           <div class="skeleton h-24 w-full rounded-2xl"></div>
           <div class="skeleton h-24 w-full rounded-2xl opacity-60"></div>
        </div>
      `;
      return;
    }

    const gridClass = isDetailed ? 'grid grid-cols-1 gap-10' : 'space-y-8';

    this.innerHTML = `
      <!-- Breaking Signal Ticker -->
      <div class="mb-12 bg-black/60 border border-white/10 rounded-2xl p-6 flex items-center gap-8 overflow-hidden relative group">
         <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
         <div class="flex items-center gap-4 shrink-0">
            <span class="status-pill danger pulse px-4 py-2 text-[10px]">BREAKING_SIGNAL</span>
            <div class="w-px h-8 bg-white/10"></div>
         </div>
         <div id="breaking-signal-text" class="text-sm font-black italic tracking-tight text-slate-300 transition-opacity duration-500 line-clamp-1">
            ${this.news[this.currentIndex]?.title || 'Awaiting synchronization...'}
         </div>
         <div class="ml-auto p-4 bg-primary/10 border border-primary/20 rounded-xl text-primary animate-pulse">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
         </div>
      </div>

      <div class="${gridClass}">
        ${displayNews.map(item => `
          <a href="${item.link}" target="_blank" class="block p-10 bg-black/40 border border-white/5 rounded-3xl hover:border-primary/40 hover:bg-black/60 transition-all group relative overflow-hidden shadow-2xl backdrop-blur-xl">
            <!-- Background Glow -->
            <div class="absolute -top-20 -right-20 w-40 h-40 bg-primary/5 blur-[80px] rounded-full group-hover:bg-primary/10 transition-all"></div>
            
            <div class="flex justify-between items-start mb-8">
               <div class="flex items-center gap-4">
                  <div class="p-3 rounded-xl border ${this.getSeverityStyles(item.severity)}">
                     ${this.getCategoryIcon(item.category)}
                  </div>
                  <div class="flex flex-col gap-1">
                     <span class="mono-xs font-black text-slate-500 tracking-[0.2em] uppercase">${item.source}</span>
                     <span class="mono-xs text-slate-700 font-bold uppercase">${new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
               </div>
               <span class="status-pill ${item.severity === 'CRITICAL' ? 'danger animate-glitch' : item.severity === 'HIGH' ? 'warning' : 'primary'} !px-6 !py-2 text-[9px] font-black uppercase tracking-widest shadow-xl">
                  ${item.severity}
               </span>
            </div>

            <h4 class="text-xl font-black text-white group-hover:text-primary transition-colors mb-6 uppercase tracking-tighter leading-tight line-clamp-2">
               ${item.title}
            </h4>
            
            <p class="mono-xs text-slate-500 line-clamp-3 leading-relaxed mb-8 font-medium">
               ${item.summary}
            </p>

            <div class="flex items-center justify-between pt-8 border-t border-white/5">
                <div class="flex items-center gap-3 text-primary/40 group-hover:text-primary transition-all">
                    <span class="mono-xs font-black uppercase tracking-[0.4em] text-[9px]">INTERCEPT_FULL_SIGNAL</span>
                    <svg class="transition-transform group-hover:translate-x-2" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </div>
                <div class="flex items-center gap-2">
                   <div class="w-2 h-2 rounded-full bg-primary/20 group-hover:bg-primary transition-colors"></div>
                   <div class="w-2 h-2 rounded-full bg-primary/20"></div>
                   <div class="w-2 h-2 rounded-full bg-primary/20"></div>
                </div>
            </div>
          </a>
        `).join('')}
      </div>

      ${!isDetailed ? `
        <div class="mt-16">
            <a href="/intelligence" class="t-btn primary w-full justify-center py-6 group shadow-primary/10">
                <span class="mono-xs font-black tracking-[0.5em] uppercase">ACCESS_GLOBAL_INTELLIGENCE_DECK</span>
                <svg class="transition-transform group-hover:translate-x-3" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12H3"/><path d="m15 18 6-6-6-6"/></svg>
            </a>
        </div>
      ` : ''}
    `;
  }
}

if (!customElements.get('news-feed')) {
  customElements.define('news-feed', NewsFeed);
}

