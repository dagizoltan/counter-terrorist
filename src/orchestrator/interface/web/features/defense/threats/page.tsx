import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Threats Page
 * Global OSINT ingestion and tactical intelligence.
 */
export const ThreatsPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Threat Intelligence Index" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/ThreatMap.js',
      '/components/islands/ThreatIntelList.js',
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken}>
      
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Threat Intelligence</h1>
          <span class="subtitle">Global OSINT Stream // Reputations: Optimized</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 px-4 py-2 bg-success/5 border border-success/20 rounded">
            <span class="dot active shadow-success"></span>
            <span class="mono-xs font-black text-success tracking-widest uppercase">Sync_Active</span>
          </div>
        </div>
      </header>

      {/* 2. Primary Intelligence Grid */}
      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        {/* THREAT STREAM */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel group p-0 flex flex-col min-h-[800px]">
           <header class="p-10 border-b border-white/5 flex justify-between items-center bg-black/30">
              <div class="flex items-center gap-8">
                 <div class="w-1.5 h-10 bg-danger rounded-full shadow-danger animate-pulse"></div>
                 <div class="flex flex-col gap-1.5">
                    <h3 class="tactical-title text-2xl tracking-[0.2em]">GLOBAL_THREAT_STREAM</h3>
                    <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.25em]">Real-time OSINT & ingress neutralization feed</p>
                 </div>
              </div>
              <div class="flex items-center gap-5 bg-danger/10 border border-danger/20 px-8 py-4 rounded-full shadow-danger/10">
                 <span class="dot danger shadow-danger"></span>
                 <span class="mono-xs font-black text-danger tracking-[0.3em] uppercase">Enforcement_Active</span>
              </div>
           </header>
            <div class="p-12 flex-grow overflow-y-auto custom-scrollbar">
              <threat-intel-list></threat-intel-list>
           </div>
        </div>

        {/* GEOLOCATION & NEWS */}
        <div class="col-span-12 lg:col-span-4 flex flex-col gap-8">
          <div class="t-panel glass-panel p-0 relative group h-[450px]">
              <header class="p-8 border-b border-white/10 relative z-10 bg-black/60 flex justify-between items-center backdrop-blur-md">
                 <h3 class="tactical-title text-base tracking-widest">GEOSPATIAL_VECTOR</h3>
                 <span class="mono-xs text-slate-400 font-black tracking-[0.2em]">NODE_01 // SEC_MAP</span>
              </header>
              <div class="absolute inset-0 z-0">
                 <threat-map></threat-map>
              </div>
              <div class="absolute bottom-8 left-8 right-8 z-10 pointer-events-none">
                 <div class="flex justify-between items-center bg-black/80 border border-white/10 p-5 rounded-lg backdrop-blur-xl">
                    <span class="mono-xs font-black text-primary tracking-widest">Active_Probes: 1,248</span>
                    <span class="mono-xs font-black text-slate-500 tracking-widest uppercase">Global_Sync</span>
                 </div>
              </div>
           </div>

           <div class="t-panel glass-panel flex-grow p-0 flex flex-col">
              <header class="p-8 border-b border-white/5 bg-black/30 flex justify-between items-center">
                 <div class="flex flex-col gap-1.5">
                    <h3 class="tactical-title text-base tracking-widest">TACTICAL_NEWS</h3>
                    <p class="mono-xs text-slate-500 font-black uppercase tracking-widest">OSINT_SIGNALS</p>
                 </div>
                 <div class="flex items-center gap-4 bg-primary/10 px-6 py-3 rounded-full border border-primary/20">
                    <div class="dot active shadow-primary animate-pulse"></div>
                    <span class="mono-xs font-black text-primary tracking-widest uppercase">Syncing</span>
                 </div>
              </header>
              <div class="p-10 overflow-y-auto max-h-[500px] custom-scrollbar flex-grow">
                 <news-feed></news-feed>
              </div>
           </div>
        </div>
      </div>

      {/* 3. Provider Reputation Ledger */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
          <div class="col-span-12 t-panel glass-panel border-t-2 border-slate-800">
              <div class="flex items-center justify-between mb-16 pb-8 border-b border-white/10">
                <div class="flex items-center gap-8">
                   <div class="p-5 bg-white/5 border border-white/10 rounded-xl">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   </div>
                   <div>
                      <h3 class="tactical-title text-3xl tracking-widest">CURATED_INTEL_PROVIDERS</h3>
                      <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2"> CTS_FUSION Weighting_Algorithm v2.4</p>
                   </div>
                </div>
                <button class="t-btn px-8 py-4 text-xs font-black tracking-widest">Update_Provider_Manifest</button>
              </div>
              
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                 {[
                   { name: 'Abuse.ch', weight: 'CRITICAL', score: 95, theme: 'danger' },
                   { name: 'Spamhaus', weight: 'MAXIMUM', score: 98, theme: 'success' },
                   { name: 'Talos', weight: 'HIGH', score: 90, theme: 'primary' },
                   { name: 'FireHOL', weight: 'MEDIUM', score: 80, theme: 'warning' }
                 ].map(prov => (
                   <div class="p-10 t-panel glass-panel border-l-4 transition-all hover:bg-white/[0.03] hover:translate-y-[-4px] cursor-default group" style={{ borderLeftColor: `var(--${prov.theme})` }}>
                      <div class="flex justify-between items-start mb-10">
                         <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.2em] group-hover:text-white transition-colors">{prov.name}</span>
                         <span class="mono-xs font-black tracking-widest uppercase px-3 py-1 bg-white/5 rounded border border-white/5" style={{ color: `var(--${prov.theme})` }}>{prov.weight}</span>
                      </div>
                      <div class="flex justify-between items-end mb-8">
                         <span class="text-5xl font-black text-white tracking-tighter tabular-nums leading-none">{prov.score}%</span>
                         <span class="mono-xs font-bold text-slate-600 uppercase tracking-widest">Confidence</span>
                      </div>
                      <div class="h-2 w-full bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/5">
                        <div class="h-full opacity-60 shadow-lg" style={{ width: `${prov.score}%`, backgroundColor: `var(--${prov.theme})` }}></div>
                      </div>
                   </div>
                 ))}
              </div>
          </div>
      </section>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
