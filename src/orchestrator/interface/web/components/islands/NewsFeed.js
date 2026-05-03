/**
 * Custom Element: NewsFeed
 * Real-time aggregator for external cyber intelligence signals.
 */
class NewsFeed extends HTMLElement {
  constructor() {
    super();
    this.news = [];
  }

  connectedCallback() {
    this.render();
    this.setupListeners();
  }

  setupListeners() {
    // Listen for metrics updates from MetricsHydrator
    window.addEventListener('metrics-update', (e) => {
      if (e.detail?.news?.latest) {
        this.news = e.detail.news.latest;
        this.render();
      }
    });
  }

  render() {
    const isDetailed = this.getAttribute('detailed') === 'true';
    const displayNews = isDetailed ? this.news : this.news.slice(0, 5);

    if (this.news.length === 0) {
      this.innerHTML = `
        <div class="flex flex-col gap-6">
           <div class="skeleton h-20 w-full"></div>
           <div class="skeleton h-20 w-full opacity-60"></div>
        </div>
      `;
      return;
    }

    const gridClass = isDetailed ? 'grid grid-cols-1 md:grid-cols-2 gap-8' : 'space-y-6';

    this.innerHTML = `
      <div class="${gridClass}">
        ${displayNews.map(item => `
          <a href="${item.link}" target="_blank" class="block p-8 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/40 hover:bg-black/60 transition-all group relative overflow-hidden shadow-xl">
            <div class="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-100 transition-opacity">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </div>
            <div class="flex justify-between items-center mb-4">
               <span class="status-pill primary border-none bg-primary/10 text-[10px] py-1 px-4 rounded-full font-black tracking-widest">${item.source}</span>
               <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">${new Date(item.timestamp).toLocaleDateString()}</span>
            </div>
            <h4 class="text-base font-black text-slate-100 group-hover:text-primary transition-colors mb-3 uppercase tracking-tight leading-tight">${item.title}</h4>
            <p class="mono-xs text-slate-500 line-clamp-3 leading-relaxed mb-4">${item.summary}</p>
            <div class="flex items-center gap-3 text-primary/40 group-hover:text-primary transition-colors">
                <span class="mono-xs font-black uppercase tracking-[0.3em]">RECON_FULL_SIGNAL</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </div>
          </a>
        `).join('')}
      </div>

      ${!isDetailed ? `
        <div class="mt-12 text-center">
            <a href="/intel/news" class="t-btn w-full justify-center py-4 group">
                <span class="mono-xs font-black tracking-[0.4em] uppercase">VIEW_ALL_INTELLIGENCE</span>
                <svg class="transition-transform group-hover:translate-x-2" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
            </a>
        </div>
      ` : ''}
    `;
  }
}

if (!customElements.get('news-feed')) {
  customElements.define('news-feed', NewsFeed);
}
