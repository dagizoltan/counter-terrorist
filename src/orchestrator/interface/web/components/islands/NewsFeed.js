/**
 * NewsFeed Island
 * Visualizes latest cybersecurity tactical signals from RSS feeds.
 */
class NewsFeed extends HTMLElement {
    constructor() {
        super();
        this.innerHTML = `
            <div class="space-y-4" id="news-container">
                <div class="p-8 text-center text-slate-500 uppercase text-[10px] font-black tracking-widest animate-pulse">
                    Synchronizing_Tactical_Signals...
                </div>
            </div>
        `;
    }

    connectedCallback() {
        window.addEventListener('METRICS_UPDATE', (e) => {
            const news = e.detail.news?.latest || [];
            this.render(news);
        });
    }

    render(news) {
        const container = this.querySelector('#news-container');
        if (!news || news.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-slate-600 text-[10px] uppercase font-black">No_Signals_In_Buffer</div>';
            return;
        }

        container.innerHTML = news.map(item => `
            <a href="${item.link}" target="_blank" class="block p-4 glass-panel border border-white/5 rounded-lg hover:border-cyber/30 transition-all group">
                <div class="flex justify-between items-start mb-2">
                    <span class="text-[9px] font-black text-cyber uppercase tracking-widest">${item.source}</span>
                    <span class="text-[8px] font-mono text-slate-500">${new Date(item.timestamp).toLocaleTimeString()}</span>
                </div>
                <h4 class="text-[11px] font-black text-white mb-2 leading-tight group-hover:text-cyber transition-colors uppercase">${item.title}</h4>
                <p class="text-[9px] font-medium text-slate-400 leading-relaxed">${item.summary}</p>
                <div class="mt-3 flex items-center gap-2">
                    <div class="w-1 h-1 rounded-full bg-cyber"></div>
                    <span class="text-[7px] font-black text-slate-600 uppercase tracking-[0.2em]">Read_Full_Signal</span>
                </div>
            </a>
        `).join('');
    }
}

customElements.define('news-feed', NewsFeed);
