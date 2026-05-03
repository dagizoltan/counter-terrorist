import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Events Page
 * Unified live threat stream viewer.
 */
export const EventsPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/components/islands/BlockingLog.js'];

  return (
    <Layout title="Security Events" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Live Threat Stream</h1>
          <span class="subtitle">Forensic Pipeline // Real-time Ingress Analysis</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-danger/10 border border-danger/30 px-8 py-4 rounded-full shadow-danger/20">
              <span class="dot danger shadow-danger animate-pulse"></span>
              <span class="mono-xs font-black text-danger tracking-[0.4em] uppercase">Stream_Engaged</span>
           </div>
           <button class="t-btn px-6 py-4 text-[10px] font-black tracking-widest group">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:rotate-180 transition-transform duration-700"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
              CLEAR_CACHE
           </button>
        </div>
      </header>

      {/* 2. Tactical Stats Row */}
      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in">
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel stat-card border-t-2 border-danger group">
          <span class="label">Live Vectors Blocked</span>
          <div class="value-group mt-4">
            <span class="value text-5xl tabular-nums tracking-tighter" id="evt-blocked-count">1,402</span>
            <span class="unit text-lg">Vectors</span>
          </div>
          <div class="mt-6 pt-6 border-t border-white/5 mono-xs font-black text-slate-600 uppercase tracking-widest">
             PPS_PEAK: 12.4k
          </div>
        </div>
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel stat-card border-t-2 border-warning group">
          <span class="label">Active Global Bans</span>
          <div class="value-group mt-4">
            <span class="value text-5xl tabular-nums tracking-tighter" id="evt-ban-count">842</span>
            <span class="unit text-lg">Nodes</span>
          </div>
          <div class="mt-6 pt-6 border-t border-white/5 mono-xs font-black text-slate-600 uppercase tracking-widest">
             TTL_EXPIRE: 24H_AVG
          </div>
        </div>
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel stat-card border-t-2 border-primary group">
          <span class="label">Pipeline Latency</span>
          <div class="value-group mt-4">
            <span class="value text-5xl tabular-nums tracking-tighter" id="evt-latency">0.4</span>
            <span class="unit text-lg">ms</span>
          </div>
          <div class="mt-6 pt-6 border-t border-white/5 mono-xs font-black text-slate-600 uppercase tracking-widest">
             BUFFER: 100%_HEALTHY
          </div>
        </div>
      </div>

      {/* 3. Primary Log Table */}
      <div class="grid grid-cols-12 gap-10">
        <div class="col-span-12 t-panel glass-panel p-0 overflow-hidden border-t-2 border-danger/30 group">
           <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-8">
                 <div class="p-4 bg-danger/10 border border-danger/30 text-danger rounded-xl shadow-danger/20 group-hover:scale-110 transition-transform duration-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                 </div>
                 <div>
                    <h2 class="tactical-title text-2xl tracking-widest">FULL_FORENSIC_PIPELINE</h2>
                    <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">End-to-end telemetry and causality audit</p>
                 </div>
              </div>
              <div class="flex items-center gap-6 bg-black/60 border border-white/10 px-8 py-4 rounded-full shadow-inner">
                 <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">AUDIT_NODE: <span class="text-white">LOCAL_ORCHESTRATOR</span></span>
              </div>
           </header>
           
           <div class="p-10 bg-black/40 min-h-[800px] overflow-x-auto custom-scrollbar">
              <blocking-log id="main-log-full"></blocking-log>
           </div>
        </div>
      </div>
    </Layout>
  );
};
