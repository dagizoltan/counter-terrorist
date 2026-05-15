import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const FeedPage = () => {
  return (
    <Layout title="Security Feed // Global Intelligence" csrfToken={props.csrfToken} nonce={props.nonce}>
      <div class="mb-12">
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          SECURITY_FEED
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Tactical Intelligence Signals // Global_Live_Stream</p>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_LIVE_SIGNALS
        </h2>
        <div id="feed-container" class="grid grid-cols-1 gap-6">
           <div class="glass-panel p-8 rounded-3xl text-center text-slate-500 font-black uppercase text-[11px] tracking-widest italic opacity-50 border border-white/5">
              Hydrating_Global_Signals...
           </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function loadFeed() {
          const res = await fetch('/api/threats/feed');
          const signals = await res.json();
          const container = document.getElementById('feed-container');
          
          if (signals.length === 0) {
            container.innerHTML = '<div class="glass-panel p-8 rounded-3xl text-center text-slate-500 font-black uppercase text-[11px] tracking-widest italic opacity-50 border border-white/5">No active signals detected.</div>';
            return;
          }

          container.innerHTML = signals.map(s => `
            <div class="glass-panel p-6 rounded-3xl border border-white/5 hover:border-cyber/30 group relative overflow-hidden">
              <div class="absolute top-0 right-0 p-8 opacity-5">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-cyber"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
              </div>
              <div class="flex justify-between items-start mb-6 relative z-10">
                <div class="flex items-center gap-3">
                   <div class="px-3 py-1 rounded bg-cyber/10 border border-cyber/30 text-cyber text-[9px] font-black uppercase tracking-widest">${window.escapeHTML(s.source)}</div>
                </div>
                <span class="text-[10px] font-mono text-slate-500 uppercase tracking-widest">${new Date(s.timestamp).toLocaleTimeString()} // ${new Date(s.timestamp).toLocaleDateString()}</span>
              </div>
              <h3 class="text-2xl font-black text-white mb-4 tracking-tight relative z-10">${window.escapeHTML(s.title)}</h3>
              <p class="text-slate-400 mb-8 leading-relaxed line-clamp-3 relative z-10 font-medium">${window.escapeHTML(s.summary)}</p>
              <div class="flex items-center justify-between relative z-10 pt-6 border-t border-white/5">
                <a href="${window.escapeHTML(s.link)}" target="_blank" class="flex items-center gap-3 text-[10px] font-black text-cyber uppercase tracking-[0.2em] hover:gap-6">
                   Full_Intelligence_Report <span class="text-lg">→</span>
                </a>
              </div>
            </div>
          `).join('');
        }
        loadFeed();
        setInterval(loadFeed, 60000);
      ` }} />
    </Layout>
  );
};
