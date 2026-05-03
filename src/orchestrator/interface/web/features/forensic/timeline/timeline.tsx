import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const TimelinePage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/components/islands/TimelineIsland.js'];

  return (
    <Layout title="Forensic Timeline // Rewind" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Forensic Timeline</h1>
          <span class="subtitle">Event Reconstruction Active // Buffer: Optimal</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-6 bg-primary/10 border border-primary/20 px-10 py-4 rounded-full shadow-primary/10">
              <span class="dot active shadow-primary"></span>
              <span class="status-pill primary border-none bg-transparent p-0">Reconstruction_Active</span>
           </div>
        </div>
      </header>

      {/* 2. Timeline Control Buffer */}
      <section class="mb-16 animate-fade-in" style="animation-delay: 100ms;">
        <div class="flex items-center gap-6 mb-10 pb-4 border-b border-white/5">
           <div class="w-12 h-1.5 bg-primary rounded-full shadow-primary"></div>
           <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">01_TIMELINE_CONTROL_BUFFER</h2>
        </div>
        <div class="t-panel glass-panel group border-t-2 border-primary/30 relative">
           <div class="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(circle_at_top_right,_var(--primary)_0%,_transparent_60%)]"></div>
           <div class="flex justify-between items-center mb-12 pb-8 border-b border-white/10 relative z-10">
              <div class="flex items-center gap-8">
                 <div class="p-5 bg-white/5 border border-white/10 text-slate-400 rounded-xl shadow-inner group-hover:text-primary transition-colors duration-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                 </div>
                 <div>
                    <h3 class="tactical-title text-2xl tracking-widest">TIMELINE_REWIND_BUFFER</h3>
                    <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Live visualization of system state history</p>
                 </div>
              </div>
               <div id="timeline-mode" class="status-pill danger pulse">Initializing_Buffer...</div>
           </div>
           
           <div class="relative h-24 flex items-center mb-12 px-8 bg-black/60 rounded-2xl border border-white/10 shadow-inner group-hover:border-primary/20 transition-colors relative z-10">
              <div class="absolute left-8 right-8 h-2 bg-white/5 rounded-full overflow-hidden">
                <div id="timeline-progress" class="h-full bg-primary shadow-primary transition-all duration-700" style="width: 0%"></div>
              </div>
              <div id="timeline-markers" class="absolute inset-0 px-8 flex items-center justify-between">
                 {/* Markers will be injected here */}
              </div>
           </div>
           
           <div class="flex justify-between text-[11px] font-black uppercase text-slate-600 tracking-[0.5em] px-8 tabular-nums relative z-10">
              <span id="timeline-start" class="group-hover:text-slate-400 transition-colors">T-24H_HISTORY</span>
              <div class="flex items-center gap-6">
                 <span class="opacity-20">T-12H</span>
                 <div class="w-1.5 h-1.5 bg-slate-800 rounded-full"></div>
                 <span class="opacity-20">T-6H</span>
              </div>
              <span id="timeline-now" class="text-primary animate-pulse tracking-[0.6em] font-black">NOW_LIVE_INGRESS</span>
           </div>
        </div>
      </section>

      {/* 3. Incident Reconstruction Grid */}
      <div class="grid grid-cols-12 gap-10 animate-fade-in" style="animation-delay: 200ms;">
         <div class="col-span-12 lg:col-span-8 flex flex-col gap-10">
            <div class="flex items-center gap-6 mb-4 pb-4 border-b border-white/5">
               <div class="w-10 h-1.5 bg-primary rounded-full shadow-primary"></div>
               <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">02_EVENT_LOG_RECONSTRUCTION</h2>
            </div>
            <div id="timeline-events" class="flex flex-col gap-8">
               <div class="t-panel glass-panel text-center border-dashed border-white/10 opacity-30">
                  <span class="mono-xs font-black animate-pulse text-primary uppercase tracking-[0.6em]">Reconstructing_Event_Horizon...</span>
               </div>
            </div>
         </div>
         
         <div class="col-span-12 lg:col-span-4 flex flex-col gap-10">
            <div class="flex items-center gap-6 mb-4 pb-4 border-b border-white/5">
               <div class="w-10 h-1.5 bg-primary rounded-full shadow-primary"></div>
               <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">03_FORENSIC_ANALYTICS</h2>
            </div>
            <div class="t-panel glass-panel group border-t-4 border-primary transition-all hover:bg-white/[0.02]">
               <div class="flex items-center gap-8 mb-12 pb-8 border-b border-white/10">
                  <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded-xl shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>
                  </div>
                  <h3 class="tactical-title text-xl uppercase tracking-widest">EVENT_RECON_DATA</h3>
               </div>
               
               <div class="flex flex-col gap-8">
                  <div class="flex justify-between items-center p-8 bg-black/60 border border-white/5 rounded-2xl transition-all hover:translate-y-[-4px] group/item shadow-inner">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Total_Observations</span>
                     <span id="timeline-total" class="text-3xl font-black text-white tabular-nums tracking-tighter leading-none">000</span>
                  </div>
                  <div class="flex justify-between items-center p-8 bg-danger/10 border border-danger/30 rounded-2xl transition-all hover:translate-y-[-4px] group/item shadow-danger/10">
                     <span class="mono-xs text-danger font-black uppercase tracking-widest">Critical_Incursions</span>
                     <span id="timeline-critical" class="text-3xl font-black text-danger tabular-nums tracking-tighter leading-none">000</span>
                  </div>
                  <div class="flex justify-between items-center p-8 bg-warning/5 border border-warning/20 rounded-2xl transition-all hover:translate-y-[-4px] group/item shadow-inner">
                     <span class="mono-xs text-warning font-black uppercase tracking-widest">Perimeter_Blocks</span>
                     <span id="timeline-blocks" class="text-3xl font-black text-warning tabular-nums tracking-tighter leading-none">000</span>
                  </div>
               </div>
               
               <div class="mt-12">
                  <a href="/api/analysis/export" class="t-btn block w-full text-center py-6 text-[10px] font-black uppercase tracking-[0.4em] group/btn">
                    <svg class="inline-block mr-3 group-hover/btn:translate-y-0.5 transition-transform" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download_Forensic_Bundle
                  </a>
               </div>
            </div>
            
            <div class="t-panel glass-panel p-10 opacity-40 border border-dashed border-white/10 rounded-2xl">
               <p class="mono-xs text-slate-500 font-black uppercase leading-loose text-center tracking-widest italic">
                 Data integrity verified via hardware-rooted TPM manifest. <br/>
                 <span class="text-primary">SHA-384 Chain Validated</span>
               </p>
            </div>
         </div>
      </div>
      <timeline-island></timeline-island>
    </Layout>
  );
};
