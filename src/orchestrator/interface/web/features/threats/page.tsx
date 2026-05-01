import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const ThreatsPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Threat Intelligence Index" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/ThreatMap.js',
      '/components/islands/ThreatIntelList.js',
      '/components/islands/NewsFeed.js'
    ]} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Threat_Intelligence_Index</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Global OSINT Ingestion // Reputation-Weighted Attribution // Tactical_Signals</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-16">
        {/* THREAT STREAM */}
        <div class="lg:col-span-2 glass-panel rounded-xl border border-white/5 p-8 flex flex-col">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60">Global_Threat_Enforcement_Stream</h3>
              <div class="flex items-center gap-2">
                 <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                 <span class="text-[9px] font-black text-emerald-500 uppercase tracking-widest italic">Weighted_Reputation_Active</span>
              </div>
           </div>
           <div class="flex-grow overflow-y-auto custom-scrollbar pr-2 max-h-[600px]">
              <threat-intel-list></threat-intel-list>
           </div>
        </div>

        {/* NEWS FEED */}
        <div class="glass-panel rounded-xl border border-white/5 p-8 flex flex-col">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60">Tactical_News_Signals</h3>
           </div>
           <div class="flex-grow overflow-y-auto custom-scrollbar pr-2 max-h-[600px]">
              <news-feed></news-feed>
           </div>
        </div>

        {/* GEOLOCATION & ANALYTICS */}
        <div class="space-y-8">
           <div class="glass-panel rounded-xl border border-white/5 p-8 relative overflow-hidden h-[300px]">
              <div class="flex justify-between items-center mb-8">
                 <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60">Geospatial_Map</h3>
              </div>
              <threat-map></threat-map>
           </div>

           <div class="glass-panel rounded-xl border border-white/5 p-8">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60 mb-8 pb-4 border-b border-white/5">Curated_Providers</h3>
              <div class="space-y-4">
                 {[
                   { name: 'Abuse.ch', weight: 'CRITICAL', score: 95 },
                   { name: 'Spamhaus', weight: 'MAX', score: 98 },
                   { name: 'Talos', weight: 'HIGH', score: 90 },
                   { name: 'FireHOL', weight: 'MED', score: 80 }
                 ].map(prov => (
                   <div class="flex justify-between items-center">
                      <span class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{prov.name}</span>
                      <div class="flex items-center gap-3">
                         <span class="text-[9px] font-mono text-white/60">{prov.score}%</span>
                         <span class="text-[8px] font-black text-cyber uppercase">${prov.weight}</span>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
