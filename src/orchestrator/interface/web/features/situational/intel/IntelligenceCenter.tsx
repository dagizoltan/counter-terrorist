import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const IntelligenceCenterPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Intelligence Deck // Tactical Signal" islandPaths={[
      '/components/islands/ThreatMap.js',
      '/components/islands/MeshHeatmap.js',
      '/components/islands/ThreatIntelList.js',
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Intelligence Deck</h1>
          <span class="subtitle">Global Signals & Operational OSINT Hub // v4.2-STABLE</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-8 py-4 rounded-full shadow-primary/20">
              <span class="dot active shadow-primary animate-pulse"></span>
              <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Intelligence_Synched</span>
           </div>
        </div>
      </header>

      {/* 02_Situational_Awareness_Grid */}
      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        
        {/* LEFT: THREAT_STREAM */}
        <div class="col-span-12 lg:col-span-7 t-panel glass-panel p-0 border-t-2 border-slate-800 group flex flex-col">
           <header class="p-10 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-8">
                 <div class="w-1.5 h-10 bg-danger rounded-full shadow-danger animate-pulse"></div>
                 <div class="flex flex-col gap-1.5">
                    <h3 class="tactical-title text-2xl tracking-[0.2em]">GLOBAL_THREAT_STREAM</h3>
                    <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.25em]">Real-time OSINT & ingress neutralization feed</p>
                 </div>
              </div>
              <div class="status-pill error pulse px-8 py-3 font-black tracking-widest shadow-danger/20">ENFORCEMENT_ACTIVE</div>
           </header>
           <div class="p-10 flex-grow overflow-y-auto max-h-[800px] custom-scrollbar bg-black/20">
              <threat-intel-list></threat-intel-list>
           </div>
        </div>

        {/* RIGHT: MAPS_AND_SIGNALS */}
        <div class="col-span-12 lg:col-span-5 flex flex-col gap-10">
           {/* Map Toggle Card */}
           <div class="t-panel glass-panel p-0 border-t-2 border-primary/30 relative overflow-hidden group min-h-[500px]">
              <header class="p-8 border-b border-white/10 flex justify-between items-center bg-black/60 backdrop-blur-md relative z-10">
                 <h3 class="tactical-title text-base tracking-widest">SPATIAL_VECTORING</h3>
                 <div class="flex gap-4">
                    <button class="px-4 py-1.5 bg-primary/20 border border-primary/30 rounded text-[10px] font-black text-primary uppercase tracking-widest">Global</button>
                    <button class="px-4 py-1.5 bg-white/5 border border-white/5 rounded text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors">Mesh</button>
                 </div>
              </header>
              <div class="absolute inset-0 z-0 opacity-80 group-hover:opacity-100 transition-opacity">
                 <threat-map></threat-map>
              </div>
              <div class="absolute bottom-8 left-8 right-8 z-10 pointer-events-none">
                 <div class="flex justify-between items-center bg-black/80 border border-white/10 p-5 rounded-xl backdrop-blur-xl shadow-2xl">
                    <div class="flex items-center gap-3">
                       <span class="dot active shadow-primary animate-pulse"></span>
                       <span class="mono-xs font-black text-primary tracking-widest uppercase">Live_Probes: 4,092</span>
                    </div>
                    <span class="mono-xs font-black text-slate-600 tracking-widest uppercase">Spatial_Sync: Optimal</span>
                 </div>
              </div>
           </div>

           {/* News Feed Card */}
           <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 flex flex-col flex-grow">
              <header class="p-8 border-b border-white/5 bg-black/40 backdrop-blur-md flex justify-between items-center">
                 <div class="flex flex-col gap-1.5">
                    <h3 class="tactical-title text-base tracking-widest">TACTICAL_SIGNALS</h3>
                    <p class="mono-xs text-slate-500 font-black uppercase tracking-widest">Global Intelligence Archive</p>
                 </div>
                 <div class="p-3 bg-white/5 border border-white/10 rounded-lg text-slate-600">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"/></svg>
                 </div>
              </header>
               <div class="p-10 flex-grow overflow-y-auto max-h-[800px] custom-scrollbar bg-black/20">
                  <news-feed detailed="true" limit="30"></news-feed>
               </div>
           </div>
        </div>
      </div>

      {/* 03_Intelligence_Verification */}
      <section class="animate-fade-in" style="animation-delay: 300ms;">
         <div class="t-panel glass-panel p-0 border-t-2 border-slate-800">
            <header class="p-12 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
               <div class="flex items-center gap-8">
                  <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-xl">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                  </div>
                  <div>
                     <h3 class="tactical-title text-2xl tracking-widest">INTEL_REPUTATION_LEDGER</h3>
                     <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Verified provider scoring matrix</p>
                  </div>
               </div>
               <button class="t-btn px-8 py-4 text-[10px] font-black uppercase tracking-widest">Refresh_Provider_Trust</button>
            </header>
            
            <div class="p-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 bg-black/20">
               {[
                 { name: 'Abuse.ch', score: 98, weight: 'CRITICAL', theme: 'danger' },
                 { name: 'Spamhaus', score: 99, weight: 'MAXIMUM', theme: 'success' },
                 { name: 'Talos', score: 92, weight: 'HIGH', theme: 'primary' },
                 { name: 'OSINT_Archive', score: 85, weight: 'MEDIUM', theme: 'warning' }
               ].map(p => (
                 <div class="p-8 t-panel glass-panel border-l-2 transition-all hover:translate-x-2 group cursor-default" style={{ borderLeftColor: `var(--${p.theme})` }}>
                    <div class="flex justify-between items-center mb-10">
                       <span class="mono-xs font-black text-slate-500 uppercase tracking-widest group-hover:text-white transition-colors">{p.name}</span>
                       <span class="text-xs font-black" style={{ color: `var(--${p.theme})` }}>{p.weight}</span>
                    </div>
                    <div class="flex justify-between items-end mb-6">
                       <span class="text-4xl font-black text-white tabular-nums tracking-tighter italic">{p.score}%</span>
                       <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">Confidence</span>
                    </div>
                    <div class="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                       <div class="h-full opacity-60" style={{ width: `${p.score}%`, backgroundColor: `var(--${p.theme})` }}></div>
                    </div>
                 </div>
               ))}
            </div>
         </div>
      </section>

    </Layout>
  );
};
