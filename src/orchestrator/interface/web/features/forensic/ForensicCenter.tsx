import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const ForensicCenterPage = (props: { csrfToken?: string }) => {
  return (
    <Layout title="Investigation Lab // Tactical Signal" islandPaths={[
      '/components/islands/TimelineIsland.js',
      '/components/islands/ReplayIsland.js'
    ]} csrfToken={props.csrfToken}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Investigation Lab</h1>
          <span class="subtitle">Post-mortem Causal Analysis & Temporal Replay Hub</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-danger/10 border border-danger/30 px-8 py-4 rounded-full shadow-danger/20">
              <span class="dot danger shadow-danger animate-pulse"></span>
              <span class="mono-xs font-black text-danger tracking-[0.4em] uppercase">Live_Ingress_Stream</span>
           </div>
        </div>
      </header>

      {/* 02_Live_Telemetry_Stream */}
      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-danger/30 group flex flex-col">
           <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-8">
                 <div class="p-4 bg-danger/10 border border-danger/30 text-danger rounded-xl shadow-danger/20 group-hover:scale-110 transition-transform duration-500">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                 </div>
                 <div class="flex flex-col gap-1.5">
                    <h3 class="tactical-title text-2xl tracking-widest">LIVE_SIGNAL_STREAM</h3>
                    <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.4em]">Real-time forensic packet capture and policy enforcement</p>
                 </div>
              </div>
              <div class="flex gap-4">
                 <button class="t-btn px-6 py-3 text-[10px] font-black uppercase tracking-widest">Rewind_Buffer</button>
                 <button class="t-btn danger px-6 py-3 text-[10px] font-black uppercase tracking-widest">Purge_Logs</button>
              </div>
           </header>
           <div class="p-10 bg-black/40 min-h-[600px] overflow-x-auto custom-scrollbar">
              <blocking-log id="main-log-full"></blocking-log>
           </div>
        </div>
      </div>

      {/* 03_Temporal_Analysis_Section */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
         <div class="grid grid-cols-12 gap-10">
            {/* Timeline Visualization */}
            <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 border-t-2 border-slate-800 flex flex-col overflow-hidden">
               <header class="p-8 border-b border-white/5 bg-black/40 backdrop-blur-md flex justify-between items-center">
                  <h3 class="tactical-title text-sm uppercase tracking-widest text-slate-400">TEMPORAL_CAUSALITY_MAP</h3>
                  <span class="mono-xs text-slate-700 font-black tracking-widest">WINDOW: 24H_HISTORY</span>
               </header>
               <div class="p-10 bg-black/20 min-h-[400px] relative">
                  <timeline-island></timeline-island>
               </div>
            </div>

            {/* Replay Controller */}
            <div class="col-span-12 lg:col-span-4 t-panel glass-panel p-0 border-t-2 border-primary/30 flex flex-col group">
               <header class="p-8 border-b border-white/10 bg-black/40 backdrop-blur-md">
                  <h3 class="tactical-title text-sm uppercase tracking-widest text-primary">SCENE_RECONSTRUCTION</h3>
               </header>
               <div class="p-10 flex-grow bg-black/60 relative overflow-hidden">
                  <div id="forensic-replay-root"></div>
               </div>
               <footer class="p-8 border-t border-white/5 bg-black/40 flex flex-col gap-4">
                  <button class="t-btn w-full py-4 text-[10px] font-black uppercase tracking-widest group/btn">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="mr-3 group-hover/btn:rotate-180 transition-transform duration-700"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                     Generate_Evidence_Bundle
                  </button>
               </footer>
            </div>
         </div>
      </section>

    </Layout>
  );
};
