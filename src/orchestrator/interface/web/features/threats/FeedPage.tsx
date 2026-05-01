import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const FeedPage = () => {
  return (
    <Layout title="Security Feed // Global Intelligence">
      <div class="p-12">
        <div class="mb-12">
          <h1 class="text-3xl font-black tracking-widest uppercase mb-2">Security_Feed</h1>
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Tactical Intelligence Signals // LIVE</p>
        </div>

        <div id="feed-container" class="grid grid-cols-1 gap-6">
           <div class="glass-panel p-8 rounded-2xl animate-pulse text-center text-slate-500 font-black uppercase text-[10px] tracking-widest">
              Hydrating Global Signals...
           </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          async function loadFeed() {
            const res = await fetch('/api/threats/feed');
            const signals = await res.json();
            const container = document.getElementById('feed-container');
            
            if (signals.length === 0) {
              container.innerHTML = '<div class="glass-panel p-8 rounded-2xl text-center text-slate-500 font-black uppercase text-[10px] tracking-widest">No active signals detected.</div>';
              return;
            }

            container.innerHTML = signals.map(s => \`
              <div class="glass-panel p-8 rounded-2xl border border-white/5 hover:border-cyber/30 transition-all group">
                <div class="flex justify-between items-start mb-4">
                  <span class="text-[9px] font-black text-cyber uppercase tracking-[0.2em]">\${s.source}</span>
                  <span class="text-[9px] font-bold text-slate-600 uppercase tracking-widest">\${new Date(s.timestamp).toLocaleString()}</span>
                </div>
                <h3 class="text-lg font-black text-white mb-3 tracking-wide group-hover:text-cyber transition-colors">\${s.title}</h3>
                <p class="text-sm text-slate-400 mb-6 leading-relaxed line-clamp-3">\${s.summary}</p>
                <a href="\${s.link}" target="_blank" class="inline-flex items-center gap-2 text-[9px] font-black text-cyber uppercase tracking-widest hover:gap-4 transition-all">
                   Full_Report <span class="text-lg">→</span>
                </a>
              </div>
            \`).join('');
          }
          loadFeed();
          setInterval(loadFeed, 60000);
        ` }} />
      </div>
    </Layout>
  );
};
