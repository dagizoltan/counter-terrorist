/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

export const ThreatMapPage = () => {
  const islandPaths = ['/pages/dashboard/islands/ThreatMap.js'];

  return (
    <Layout title="Global Threat Intelligence" islandPaths={islandPaths}>
      <div class="mb-12 flex justify-between items-end">
        <div>
          <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Threat Intelligence</h2>
          <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Live Global Attack Vectors // Geo-Spatial Correlation</p>
        </div>
        <div class="flex gap-4">
           <div class="px-4 py-2 bg-red-600/10 border border-red-600/20 text-red-500 text-[10px] font-black uppercase tracking-widest">
              Live Attacks: 1,242/hr
           </div>
           <div class="px-4 py-2 bg-green-600/10 border border-green-600/20 text-green-500 text-[10px] font-black uppercase tracking-widest">
              Mesh Nodes: 3
           </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
         {/* SIDEBAR INTEL */}
         <div class="lg:col-span-1 space-y-6">
            <div class="bg-white/5 border border-white/5 p-6">
               <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Top Attack Origins</h3>
               <div class="space-y-4">
                  {[
                    { country: 'China', count: 432, color: 'bg-red-500' },
                    { country: 'Russia', count: 211, color: 'bg-red-500' },
                    { country: 'USA', count: 184, color: 'bg-orange-500' },
                    { country: 'Brazil', count: 102, color: 'bg-yellow-500' },
                  ].map(c => (
                    <div class="flex flex-col gap-1">
                       <div class="flex justify-between text-[10px] font-black uppercase">
                          <span>{c.country}</span>
                          <span class="text-slate-500">{c.count}</span>
                       </div>
                       <div class="w-full h-1 bg-white/5">
                          <div class={`${c.color} h-full`} style={`width: ${(c.count / 432) * 100}%`}></div>
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            <div class="bg-white/5 border border-white/5 p-6">
               <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 pb-2 border-b border-white/5">Active ASN Blocks</h3>
               <div class="space-y-2 font-mono text-[9px] text-slate-500">
                  <p>AS14061 (DigitalOcean)</p>
                  <p>AS16509 (Amazon)</p>
                  <p>AS24940 (Hetzner)</p>
               </div>
            </div>
         </div>

         {/* MAIN MAP */}
         <div class="lg:col-span-3 bg-white/5 border border-white/5 relative h-[600px] overflow-hidden group">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_#000_100%)] z-10 pointer-events-none"></div>
            <div class="absolute top-6 left-6 z-20">
               <div class="flex items-center gap-2">
                  <div class="w-2 h-2 bg-red-600 animate-pulse"></div>
                  <span class="text-[10px] font-black uppercase tracking-widest">Live_Capture_Stream</span>
               </div>
            </div>
            
            <div class="w-full h-full transform scale-125 translate-y-10">
               <threat-map id="main-map"></threat-map>
            </div>

            {/* OVERLAY TELEMETRY */}
            <div class="absolute bottom-6 right-6 z-20 w-64 bg-black/80 border border-white/5 p-4 font-mono text-[9px] space-y-1 text-slate-400">
               <p><span class="text-red-500">[BLOCK]</span> IP: 185.x.x.x -> SSH_DECOY</p>
               <p><span class="text-red-500">[BLOCK]</span> IP: 45.x.x.x -> REDIS_VAULT</p>
               <p><span class="text-yellow-500">[SCAN]</span> IP: 91.x.x.x -> TCP_STEALTH</p>
            </div>
         </div>
      </div>
    </Layout>
  );
};
