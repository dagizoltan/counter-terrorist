import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Intelligence Center Page
 * Central hub for tactical signals and global intelligence.
 * Refined for high-readability and zero-underscore policy.
 */
export const IntelligenceCenterPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout nonce={props.nonce} title="Intelligence Deck // Tactical Signal" islandPaths={[
      '/components/islands/ThreatMap.js',
      '/components/islands/MeshHeatmap.js',
      '/components/islands/ThreatIntelList.js',
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Intelligence Deck</h1>
          <span class="subtitle">Global Signals & Operational OSINT Hub // v4.2-STABLE</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-success/10 border border-success/30 px-8 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active"></span>
              <span class="mono-xs font-black text-success tracking-[0.4em] uppercase">Intelligence Synched</span>
           </div>
        </div>
      </header>

      {/* 02_Situational_Awareness_Grid */}
      <div class="grid grid-cols-12 gap-6 mb-8">
        
        {/* LEFT: THREAT_STREAM */}
        <div class="col-span-12 lg:col-span-7 t-panel glass-panel p-0 border-t-2 border-slate-800 group flex flex-col">
           <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-4">
                 <div class="w-1.5 h-10 bg-danger rounded-full shadow-[0_0_15px_rgba(var(--danger-rgb),0.5)]"></div>
                 <div class="flex flex-col gap-2">
                    <h3 class="tactical-title text-2xl tracking-[0.2em]">Global Threat Stream</h3>
                    <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.25em]">Real-time OSINT & ingress neutralization feed</p>
                 </div>
              </div>
              <div class="status-pill error px-8 py-3 font-black tracking-widest text-[10px]">Enforcement Active</div>
           </header>
           <div class="p-8 flex-grow overflow-y-auto max-h-[800px] custom-scrollbar bg-black/20">
              <threat-intel-list></threat-intel-list>
           </div>
        </div>

        {/* RIGHT: MAPS_AND_SIGNALS */}
        <div class="col-span-12 lg:col-span-5 flex flex-col gap-6">
           {/* Map Toggle Card */}
           <div class="t-panel glass-panel p-0 border-t-2 border-slate-700 relative overflow-hidden group min-h-[500px]">
              <header class="p-8 border-b border-white/10 flex justify-between items-center bg-black/60 backdrop-blur-md relative z-10">
                 <h3 class="tactical-title text-base tracking-widest uppercase">Spatial Vectoring</h3>
                 <div class="flex gap-4">
                    <button class="px-6 py-2.5 bg-white/10 border border-white/10 rounded-full text-[10px] font-black text-white uppercase tracking-widest transition-all hover:bg-white/20">Global</button>
                    <button class="px-6 py-2.5 bg-white/5 border border-white/5 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all">Mesh</button>
                 </div>
              </header>
              <div class="absolute inset-0 z-0 opacity-80">
                 <threat-map></threat-map>
              </div>
              <div class="absolute bottom-8 left-8 right-8 z-10 pointer-events-none">
                  <div class="flex justify-between items-center bg-black/90 border border-white/10 p-6 rounded-2xl backdrop-blur-2xl">
                     <div class="flex items-center gap-4">
                        <span class="dot active"></span>
                        <span class="mono-xs font-black text-success tracking-widest uppercase">Live Probes: 4,092</span>
                     </div>
                     <span class="mono-xs font-black text-slate-600 tracking-widest uppercase">Spatial Sync: Optimal</span>
                  </div>
              </div>
           </div>

           {/* News Feed - Sanitized */}
           <div class="flex flex-col flex-grow t-panel glass-panel p-8 border-t-2 border-slate-700 bg-black/40">
               <header class="mb-8 flex justify-between items-center">
                  <h3 class="mono-xs font-black text-slate-400 tracking-[0.4em] uppercase">Latest Signals</h3>
                  <a href="/intel/feed" class="mono-xs font-black text-slate-500 tracking-widest uppercase hover:text-white transition-colors">Full Feed</a>
               </header>
               <news-feed detailed="false" limit="6"></news-feed>
           </div>
        </div>
      </div>

      {/* 03_Intelligence_Verification */}
      <section class="animate-in fade-in slide-in-from-bottom-4 duration-1000">
         <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 bg-black/30 backdrop-blur-xl">
            <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
               <div class="flex items-center gap-6">
                  <div class="p-5 bg-white/5 border border-white/10 text-slate-400 rounded-2xl">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                  <div class="flex flex-col gap-2">
                     <h3 class="tactical-title text-3xl tracking-widest uppercase">Intel Reputation Ledger</h3>
                     <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Verified provider scoring matrix</p>
                  </div>
               </div>
               <button class="t-btn px-10 py-5 text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-transform">Refresh Provider Trust</button>
            </header>
            
            <div class="p-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
               {[
                 { name: 'Abuse.ch', score: 98, weight: 'Maximum', theme: 'danger' },
                 { name: 'Spamhaus', score: 99, weight: 'Maximum', theme: 'success' },
                 { name: 'Talos', score: 92, weight: 'High', theme: 'primary' },
                 { name: 'OSINT Archive', score: 85, weight: 'Medium', theme: 'warning' }
               ].map(p => (
                 <div class="p-10 t-panel glass-panel border-l-2 group cursor-default transition-all hover:bg-white/[0.02]" style={{ borderLeftColor: `var(--${p.theme})` }}>
                    <div class="flex justify-between items-center mb-12">
                       <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">{p.name}</span>
                       <span class="text-[10px] font-black uppercase tracking-widest" style={{ color: `var(--${p.theme})` }}>{p.weight}</span>
                    </div>
                    <div class="flex justify-between items-end mb-8">
                       <span class="text-5xl font-black text-white tabular-nums tracking-tighter italic">{p.score}%</span>
                       <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">Confidence</span>
                    </div>
                    <div class="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                       <div class="h-full opacity-60 group-hover:opacity-100 transition-opacity" style={{ width: `${p.score}%`, backgroundColor: `var(--${p.theme})` }}></div>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      </section>

    </Layout>
  );
};
