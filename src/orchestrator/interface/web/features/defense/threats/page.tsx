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
      
      {/* 1. Header Section */}
      <header class="flex justify-between items-end mb-12 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-warning rounded shadow-warning"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase">Threat_Intel</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-success"></span>
                <span class="mono-xs font-black text-success tracking-widest uppercase">OSINT_SYNCHRONIZED</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">REPUTATION_WEIGHTING: OPTIMAL</div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Primary Intelligence Grid */}
      <div class="grid grid-cols-12 gap-8 mb-12 animate-fade-in" style="animation-delay: 100ms;">
        {/* THREAT STREAM */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel group p-0 overflow-hidden flex flex-col">
           <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
              <div class="flex flex-col gap-1">
                 <h3 class="tactical-title text-lg uppercase tracking-widest">GLOBAL_THREAT_STREAM</h3>
                 <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest">REAL-TIME OSINT & INGRESS NEUTRALIZATION FEED</p>
              </div>
              <div class="flex items-center gap-3 bg-success/5 border border-success/20 px-4 py-2 rounded">
                 <span class="dot active shadow-success"></span>
                 <span class="mono-xs font-black text-success tracking-widest uppercase">ENFORCEMENT_ACTIVE</span>
              </div>
           </header>
           <div class="p-4 bg-black/40 overflow-y-auto max-h-[700px] custom-scrollbar">
              <threat-intel-list></threat-intel-list>
           </div>
        </div>

        {/* GEOLOCATION & NEWS */}
        <div class="col-span-12 lg:col-span-4 flex flex-col gap-8">
           <div class="t-panel glass-panel p-0 overflow-hidden relative group h-[400px]">
              <header class="p-6 border-b border-white/5 relative z-10 bg-black/60 flex justify-between items-center">
                 <h3 class="tactical-title text-sm uppercase tracking-widest">GEOSPATIAL_MAP</h3>
                 <span class="mono-xs text-slate-500 font-bold">GRID_01 // SEC_MAP</span>
              </header>
              <threat-map></threat-map>
           </div>

           <div class="t-panel glass-panel flex-grow p-0 overflow-hidden flex flex-col">
              <header class="p-6 border-b border-white/5 bg-black/20 flex justify-between items-center">
                 <div class="flex flex-col gap-1">
                    <h3 class="tactical-title text-sm uppercase tracking-widest">TACTICAL_NEWS</h3>
                    <p class="mono-xs text-slate-500 font-bold">OSINT_SIGNALS</p>
                 </div>
                 <div class="flex items-center gap-2">
                    <div class="dot active shadow-primary animate-pulse"></div>
                    <span class="mono-xs font-black text-primary uppercase">SYNCING</span>
                 </div>
              </header>
              <div class="p-6 bg-black/40 overflow-y-auto max-h-[500px] custom-scrollbar">
                 <news-feed></news-feed>
              </div>
           </div>
        </div>
      </div>

      {/* 3. Provider Reputation Ledger */}
      <section class="grid grid-cols-12 gap-8 animate-fade-in" style="animation-delay: 200ms;">
          <div class="col-span-12 t-panel glass-panel border-t-4 border-slate-800">
              <div class="flex items-center justify-between mb-10 pb-4 border-b border-white/5">
                <h3 class="tactical-title text-lg uppercase tracking-widest">CURATED_INTEL_PROVIDERS</h3>
                <span class="mono-xs text-slate-700 font-bold uppercase tracking-widest">Weighting_Algorithm: CTS_FUSION_V2</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                 {[
                   { name: 'Abuse.ch', weight: 'CRITICAL', score: 95, theme: 'danger' },
                   { name: 'Spamhaus', weight: 'MAXIMUM', score: 98, theme: 'success' },
                   { name: 'Talos', weight: 'HIGH', score: 90, theme: 'primary' },
                   { name: 'FireHOL', weight: 'MEDIUM', score: 80, theme: 'warning' }
                 ].map(prov => (
                   <div class="p-8 t-panel glass-panel border-l-2 transition-all hover:bg-white/[0.02] cursor-default" style={{ borderLeftColor: `var(--${prov.theme})` }}>
                      <span class="mono-xs font-black text-slate-500 uppercase tracking-widest block mb-4">{prov.name}</span>
                      <div class="flex justify-between items-end">
                         <span class="text-4xl font-black text-white tracking-tighter tabular-nums leading-none">{prov.score}%</span>
                         <span class="mono-xs font-black tracking-widest uppercase" style={{ color: `var(--${prov.theme})` }}>{prov.weight}</span>
                      </div>
                      <div class="mt-6 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <div class="h-full bg-white/20" style={{ width: `${prov.score}%` }}></div>
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
