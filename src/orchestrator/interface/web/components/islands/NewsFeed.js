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
    if (this.news.length === 0) {
      this.innerHTML = `
        <div class="flex flex-col gap-6">
           <div class="skeleton h-20 w-full"></div>
           <div class="skeleton h-20 w-full opacity-60"></div>
        </div>
      `;
      return;
    }

    this.innerHTML = `
      <div class="space-y-6">
        ${this.news.map(item => `
          <a href="${item.link}" target="_blank" class="block p-6 bg-black/40 border border-white/5 rounded-xl hover:border-primary/40 transition-all group relative overflow-hidden">
            <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </div>
            <div class="flex justify-between items-center mb-3">
               <span class="status-pill primary border-none bg-primary/10 text-[10px] py-1 px-3">${item.source}</span>
               <span class="mono-xs text-slate-600 font-bold">${new Date(item.timestamp).toLocaleDateString()}</span>
            </div>
            <h4 class="text-sm font-black text-slate-200 group-hover:text-white transition-colors mb-2 uppercase tracking-tight line-clamp-2">${item.title}</h4>
            <p class="mono-xs text-slate-500 line-clamp-2 leading-relaxed">${item.summary}</p>
          </a>
        `).join('')}
      </div>
    `;
  }
}

customElements.define('news-feed', NewsFeed);
