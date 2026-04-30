/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const TimelinePage = () => {
  const islandPaths = ['/pages/dashboard/islands/TimelineIsland.js'];

  return (
    <Layout title="Forensic Timeline // Rewind" islandPaths={islandPaths}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Forensic Timeline</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Multi-node event reconstruction // Incident rewind</p>
      </div>

      <div class="bg-white/5 border border-white/5 p-8 mb-12">
         <div class="flex justify-between items-center mb-8">
            <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500">Timeline Controller</h3>
            <span id="timeline-mode" class="text-[10px] font-black uppercase tracking-widest text-white px-2 py-1 bg-red-600">Loading...</span>
         </div>
         
         <div class="relative h-12 flex items-center mb-8">
            <div class="absolute w-full h-1 bg-white/10"></div>
            <div id="timeline-progress" class="absolute h-1 bg-white" style="width: 0%"></div>
            <div id="timeline-markers"></div>
         </div>
         
         <div class="flex justify-between text-[9px] font-black uppercase text-slate-500 tracking-widest">
            <span id="timeline-start">T-24h</span>
            <span>T-12h</span>
            <span>Now</span>
         </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
         <div class="lg:col-span-2 space-y-4" id="timeline-events">
            <div class="bg-white/5 border border-white/5 p-6 text-center text-slate-500 text-[10px] font-bold uppercase">
               Loading audit events...
            </div>
         </div>
         
         <div class="lg:col-span-1 space-y-8">
            <div class="bg-white/5 border border-white/5 p-8">
               <h3 class="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 pb-2 border-b border-white/5">Event Summary</h3>
               <div class="space-y-4">
                  <div class="flex justify-between text-[10px] font-black uppercase">
                     <span class="text-slate-500">Total Events</span>
                     <span id="timeline-total" class="text-white">...</span>
                  </div>
                  <div class="flex justify-between text-[10px] font-black uppercase">
                     <span class="text-slate-500">Critical</span>
                     <span id="timeline-critical" class="text-red-500">...</span>
                  </div>
                  <div class="flex justify-between text-[10px] font-black uppercase">
                     <span class="text-slate-500">Blocks</span>
                     <span id="timeline-blocks" class="text-orange-500">...</span>
                  </div>
               </div>
            </div>
            
            <a href="/api/forensics/export" class="w-full block text-center bg-white text-black py-4 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all">Download_Forensic_Bundle</a>
         </div>
      </div>
      <timeline-island></timeline-island>
    </Layout>
  );
};
