import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const TimelinePage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/components/islands/TimelineIsland.js'];

  return (
    <Layout title="Forensic Timeline // Rewind" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 1. Header Section */}
      <header class="flex justify-between items-end mb-12 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-primary rounded shadow-primary"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase">Forensic_Timeline</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-primary"></span>
                <span class="mono-xs font-black text-primary tracking-widest uppercase">EVENT_RECONSTRUCTION_ACTIVE</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">BUFFER_RELIABILITY: OPTIMAL</div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Timeline Control Buffer */}
      <section class="mb-12 animate-fade-in" style="animation-delay: 100ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">01_TIMELINE_CONTROL_BUFFER</h2>
        <div class="t-panel glass-panel group p-10">
           <div class="flex justify-between items-center mb-12 pb-6 border-b border-white/5">
              <div class="flex items-center gap-6">
                 <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded shadow-inner">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                 </div>
                 <div>
                    <h3 class="tactical-title text-xl uppercase tracking-widest">TIMELINE_REWIND_BUFFER</h3>
                    <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Live visualization of system state history</p>
                 </div>
              </div>
              <div class="flex items-center gap-4 bg-danger/5 border border-danger/20 px-6 py-3 rounded-full">
                 <span class="dot danger pulse shadow-danger"></span>
                 <span id="timeline-mode" class="mono-xs font-black text-danger tracking-widest uppercase">Initializing_Buffer...</span>
              </div>
           </div>
           
           <div class="relative h-16 flex items-center mb-10 px-4 bg-black/40 rounded-lg border border-white/5">
              <div class="absolute left-4 right-4 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div id="timeline-progress" class="h-full bg-primary shadow-primary transition-all duration-700" style="width: 0%"></div>
              </div>
              <div id="timeline-markers" class="absolute inset-0 px-4 flex items-center justify-between">
                 {/* Markers will be injected here */}
              </div>
           </div>
           
           <div class="flex justify-between text-[10px] font-black uppercase text-slate-600 tracking-[0.4em] px-4 tabular-nums">
              <span id="timeline-start">T-24H_HISTORY</span>
              <div class="flex items-center gap-4">
                 <span class="opacity-30">T-12H</span>
                 <div class="w-1 h-1 bg-slate-800 rounded-full"></div>
                 <span class="opacity-30">T-6H</span>
              </div>
              <span id="timeline-now" class="text-primary animate-pulse">NOW_LIVE_INGRESS</span>
           </div>
        </div>
      </section>

      {/* 3. Incident Reconstruction Grid */}
      <div class="grid grid-cols-12 gap-8 animate-fade-in" style="animation-delay: 200ms;">
         <div class="col-span-12 lg:col-span-8 flex flex-col gap-8">
            <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] pb-4 border-b border-white/5">02_EVENT_LOG_RECONSTRUCTION</h2>
            <div id="timeline-events" class="flex flex-col gap-6">
               <div class="t-panel glass-panel text-center p-24 border-dashed opacity-30">
                  <span class="mono-xs font-black animate-pulse text-primary uppercase tracking-[0.4em]">Reconstructing_Event_Horizon...</span>
               </div>
            </div>
         </div>
         
         <div class="col-span-12 lg:col-span-4 flex flex-col gap-8">
            <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] pb-4 border-b border-white/5">03_FORENSIC_ANALYTICS</h2>
            <div class="t-panel glass-panel group p-10 border-t-4 border-primary">
               <div class="flex items-center gap-6 mb-12 pb-6 border-b border-white/5">
                  <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded shadow-primary">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>
                  </div>
                  <h3 class="tactical-title text-sm uppercase tracking-widest">EVENT_RECON_DATA</h3>
               </div>
               
               <div class="flex flex-col gap-6">
                  <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                     <span class="metric-tag">Total_Observations</span>
                     <span id="timeline-total" class="text-4xl font-black text-white tabular-nums tracking-tighter">000</span>
                  </div>
                  <div class="flex justify-between items-center p-8 bg-danger/5 border border-danger/20 rounded transition-all hover:translate-y-[-2px]">
                     <span class="metric-tag text-danger">Critical_Incursions</span>
                     <span id="timeline-critical" class="text-4xl font-black text-danger tabular-nums tracking-tighter">000</span>
                  </div>
                  <div class="flex justify-between items-center p-8 bg-warning/5 border border-warning/20 rounded transition-all hover:translate-y-[-2px]">
                     <span class="metric-tag text-warning">Perimeter_Blocks</span>
                     <span id="timeline-blocks" class="text-4xl font-black text-warning tabular-nums tracking-tighter">000</span>
                  </div>
               </div>
               
               <div class="mt-12">
                  <a href="/api/analysis/export" class="t-btn block w-full text-center py-6 text-sm">
                    <svg class="inline-block mr-3" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Download_Forensic_Bundle
                  </a>
               </div>
            </div>
            
            <div class="t-panel glass-panel p-8 opacity-50">
               <p class="mono-xs text-slate-500 font-bold uppercase leading-relaxed text-center">
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
