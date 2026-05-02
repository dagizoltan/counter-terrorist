import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const TimelinePage = () => {
  const islandPaths = ['/pages/dashboard/islands/TimelineIsland.js'];

  return (
    <Layout title="Forensic Timeline // Rewind" islandPaths={islandPaths}>
      <div class="mb-12">
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          FORENSIC_TIMELINE
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Multi-node event reconstruction // Incident rewind</p>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_TIMELINE_CONTROL
        </h2>
        <div class="glass-panel rounded-3xl border border-white/5 p-10 mb-8 relative overflow-hidden group">
           <div class="absolute top-0 right-0 p-8 opacity-5">
              <svg class="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
           </div>
           <div class="flex justify-between items-center mb-10 pb-4 border-b border-white/5 relative z-10">
              <div class="flex items-center gap-4">
                 <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                 </div>
                 <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/80">Timeline_Rewind_Buffer</h3>
              </div>
              <span id="timeline-mode" class="px-4 py-1 rounded-full bg-danger/10 border border-danger/30 text-danger text-[10px] font-black uppercase italic animate-pulse">Syncing...</span>
           </div>
           
           <div class="relative h-16 flex items-center mb-10 px-4">
              <div class="absolute left-4 right-4 h-2 bg-white/5 rounded-full"></div>
              <div id="timeline-progress" class="absolute left-4 h-2 bg-cyber rounded-full shadow-[0_0_15px_rgba(14,165,233,0.5)] transition-all duration-500" style="width: 0%"></div>
              <div id="timeline-markers" class="absolute inset-0 px-4 flex items-center justify-between">
                 {/* Markers will be injected here */}
              </div>
           </div>
           
           <div class="flex justify-between text-[10px] font-black uppercase text-slate-600 tracking-[0.3em] px-2">
              <span id="timeline-start">T-24h</span>
              <span class="opacity-50">T-12h</span>
              <span id="timeline-now" class="text-cyber">Now_Live</span>
           </div>
        </div>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          02_EVENT_LOG_RECONSTRUCTION
        </h2>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
           <div class="lg:col-span-2 space-y-4" id="timeline-events">
              <div class="glass-panel rounded-2xl border border-white/5 p-12 text-center text-slate-500 text-[11px] font-black uppercase tracking-widest italic opacity-50">
                 Awaiting_Event_Hydration...
              </div>
           </div>
           
           <div class="lg:col-span-1 space-y-8">
              <div class="glass-panel rounded-3xl border border-white/5 p-10 flex flex-col group hover:border-white/10 transition-all">
                 <div class="flex items-center gap-4 mb-10 pb-4 border-b border-white/5">
                    <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                       <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>
                    </div>
                    <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/80">Event_Summary</h3>
                 </div>
                 <div class="space-y-8 flex-grow">
                    <div class="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/5">
                       <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Total Events</span>
                       <span id="timeline-total" class="text-xl font-black text-white font-mono">---</span>
                    </div>
                    <div class="flex justify-between items-center p-4 bg-danger/5 rounded-xl border border-danger/10">
                       <span class="text-[10px] font-black text-danger/80 uppercase tracking-widest">Critical</span>
                       <span id="timeline-critical" class="text-xl font-black text-danger font-mono">---</span>
                    </div>
                    <div class="flex justify-between items-center p-4 bg-warning/5 rounded-xl border border-warning/10">
                       <span class="text-[10px] font-black text-warning/80 uppercase tracking-widest">Blocks</span>
                       <span id="timeline-blocks" class="text-xl font-black text-warning font-mono">---</span>
                    </div>
                 </div>
                 
                 <div class="mt-12">
                    <a href="/api/analysis/export" class="w-full flex items-center justify-center p-5 rounded-xl bg-white text-[10px] font-black text-black uppercase tracking-widest transition-all hover:bg-slate-200 shadow-[0_10px_30px_-10px_rgba(255,255,255,0.3)]">Download_Forensic_Bundle</a>
                 </div>
              </div>
           </div>
        </div>
      </div>
      <timeline-island></timeline-island>
    </Layout>
  );
};
