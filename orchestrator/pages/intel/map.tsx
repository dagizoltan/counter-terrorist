/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

export const ThreatMapPage = () => {
  const islandPaths = [
    '/pages/dashboard/islands/ThreatMap.js',
    '/pages/dashboard/islands/BlockingLog.js',
    '/pages/dashboard/islands/MetricsHydrator.js',
  ];

  return (
    <Layout title="Global Threat Intelligence" islandPaths={islandPaths}>
      <div class="mb-12 flex justify-between items-end">
        <div>
          <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Threat Intelligence</h2>
          <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Live Global Attack Vectors // Geo-Spatial Correlation</p>
        </div>
        <div class="flex gap-4">
           <div class="px-4 py-2 bg-red-600/10 border border-red-600/20 text-red-500 text-[10px] font-black uppercase tracking-widest">
              Honeypot Hits: <span id="stat-honeypot-hits">...</span>
           </div>
           <div class="px-4 py-2 bg-green-600/10 border border-green-600/20 text-green-500 text-[10px] font-black uppercase tracking-widest">
              Mesh Peers: <span id="stat-mesh-nodes">...</span>
           </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
         {/* SIDEBAR INTEL */}
         <div class="lg:col-span-1 space-y-6">
            <div class="bg-white/5 border border-white/5 p-6">
               <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Blocked IPs</h3>
               <div class="space-y-4">
                  <p id="fw-blocked-count" class="text-3xl font-black">...</p>
                  <p class="text-[9px] text-slate-500 font-bold uppercase">Total firewall blocks</p>
               </div>
            </div>

            <div class="bg-white/5 border border-white/5 p-6">
               <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 pb-2 border-b border-white/5">System Status</h3>
               <div class="space-y-3">
                  <div class="flex justify-between text-[10px] font-black uppercase">
                     <span class="text-slate-500">eBPF</span>
                     <span id="stat-forensics-ebpf-status" class="text-slate-400">...</span>
                  </div>
                  <div class="flex justify-between text-[10px] font-black uppercase">
                     <span class="text-slate-500">FIM</span>
                     <span id="stat-forensics-fim-status" class="text-slate-400">...</span>
                  </div>
                  <div class="flex justify-between text-[10px] font-black uppercase">
                     <span class="text-slate-500">Canaries</span>
                     <span id="stat-canary-deployed" class="text-slate-400">...</span>
                  </div>
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

            {/* LIVE OVERLAY TELEMETRY — from real audit stream */}
            <div class="absolute bottom-0 right-0 left-0 z-20 bg-black/80 border-t border-white/5 h-[120px] overflow-hidden">
               <blocking-log id="map-log"></blocking-log>
            </div>
         </div>
      </div>
      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
