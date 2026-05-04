import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Mission Dashboard // Sovereign Overwatch
 * Primary strategic command interface.
 */
export const Dashboard = (props: { status: any; csrfToken: string }) => {
  const { platform } = props.status;
  const metrics = platform?.metrics;

  const islandPaths = [
    '/components/islands/NetworkMap.js',
    '/components/islands/HoneypotChart.js',
    '/components/islands/NewsFeed.js'
  ];

  return (
    <Layout title="Mission Dashboard // Sovereign Overwatch" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Mission Dashboard</h1>
          <span class="subtitle">Operational State: ACTIVE // Node: {platform?.hostname || "localhost"}</span>
        </div>
        <div class="flex gap-4">
          <div class="flex bg-black/40 border border-white/10 rounded-lg p-1 mr-4">
             <a href="/intelligence" class="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:bg-white/5 rounded transition-all">Intelligence_Deck</a>
             <a href="/perimeter" class="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:bg-white/5 rounded transition-all">Perimeter_Defense</a>
             <a href="/investigation" class="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-white hover:bg-white/5 rounded transition-all">Investigation_Lab</a>
          </div>
          <button class="t-btn px-6 py-3 group">
            <svg class="transition-transform group-hover:rotate-180" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            System_Sweep
          </button>
        </div>
      </header>

      {/* ── PHASE_01: OVERWATCH (Strategic Core) ────────────────────────── */}
      <section class="mb-16 animate-fade-in" style="animation-delay: 50ms;">
        <h2 class="mono-xs font-black text-primary uppercase tracking-[0.4em] mb-10 pb-4 border-b border-primary/20 flex items-center gap-4">
           <div class="w-2 h-2 bg-primary rounded-full shadow-primary"></div>
           01_STRATEGIC_MISSION_OVERVIEW
        </h2>
        <div class="grid grid-cols-12 gap-8">
          <div class="col-span-12 lg:col-span-4 t-panel glass-panel group">
            <div class="flex justify-between items-center mb-6">
              <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">System Integrity</span>
              <div class="status-pill success active !px-3 !py-1">OPTIMAL</div>
            </div>
            <div class="flex items-baseline gap-4">
              <span class="text-5xl font-black italic tracking-tighter text-white tabular-nums">100<span class="text-primary">%</span></span>
              <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Trust_Score</span>
            </div>
          </div>

          <div class="col-span-12 lg:col-span-4 t-panel glass-panel group">
            <div class="flex justify-between items-center mb-6">
               <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Infrastructure Hub</span>
               <span class="mono-xs text-primary font-black animate-pulse">ACTIVE</span>
            </div>
            <div class="flex items-baseline gap-4">
              <span class="text-5xl font-black italic tracking-tighter text-white tabular-nums">{Math.floor(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100)}<span class="text-primary">%</span></span>
              <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Load_Factor</span>
            </div>
          </div>

          <div class="col-span-12 lg:col-span-4 t-panel glass-panel group">
            <div class="flex justify-between items-center mb-6">
               <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Agent Readiness</span>
               <div class="flex gap-1">
                  <div class="w-1.5 h-1.5 rounded-full bg-success"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-success"></div>
                  <div class="w-1.5 h-1.5 rounded-full bg-success"></div>
               </div>
            </div>
            <div class="flex items-baseline gap-4">
              <span class="text-5xl font-black italic tracking-tighter text-white tabular-nums">06</span>
              <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Active_Nodes</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── PHASE_02: SIGNAL (Tactical Awareness) ────────────────────────── */}
      <section class="mb-16 animate-fade-in" style="animation-delay: 150ms;">
        <h2 class="mono-xs font-black text-danger uppercase tracking-[0.4em] mb-10 pb-4 border-b border-danger/20 flex items-center gap-4">
           <div class="w-2 h-2 bg-danger rounded-full shadow-danger"></div>
           02_TACTICAL_SIGNALS_DECK
        </h2>
        <div class="grid grid-cols-1 gap-8">
          <div class="t-panel glass-panel p-0 border-t-2 border-danger/30">
            <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
               <div class="flex items-center gap-6">
                  <div class="p-3 bg-danger/10 border border-danger/20 rounded-xl text-danger">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                  </div>
                  <div>
                     <h3 class="tactical-title text-lg tracking-widest">INGRESS_TACTICAL_SIGNALS</h3>
                     <p class="mono-xs text-slate-500 font-black uppercase tracking-widest mt-1">Real-time external intercept stream</p>
                  </div>
               </div>
               <div class="status-pill error pulse !px-6">LIVE_FEED</div>
            </header>
            <div class="p-10">
               <news-feed limit="4"></news-feed>
            </div>
          </div>
        </div>
      </section>

      {/* ── PHASE_03: STRIKE (Active Enforcement) ────────────────────────── */}
      <section class="animate-fade-in" style="animation-delay: 250ms;">
        <h2 class="mono-xs font-black text-success uppercase tracking-[0.4em] mb-10 pb-4 border-b border-success/20 flex items-center gap-4">
           <div class="w-2 h-2 bg-success rounded-full shadow-success"></div>
           03_ACTIVE_ENFORCEMENT_GRID
        </h2>
        <div class="grid grid-cols-12 gap-8">
          <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 border-t-2 border-success/30 overflow-hidden">
             <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
                <div class="flex items-center gap-6">
                   <div class="p-3 bg-success/10 border border-success/20 rounded-xl text-success">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="m19 19-3-3"/><path d="m5 5 3 3"/><path d="m16 8 3-3"/><path d="m8 16-3 3"/></svg>
                   </div>
                   <h3 class="tactical-title text-lg tracking-widest">MESH_TOPOLOGY_GRAPH</h3>
                </div>
                <div class="flex gap-4">
                   <div class="status-pill success active shadow-success/20">QUORUM: OK</div>
                </div>
             </header>
             <div class="h-[500px] relative bg-black/60 group">
                <div class="absolute inset-0 z-0 opacity-40 group-hover:opacity-100 transition-opacity">
                   <network-map></network-map>
                </div>
                {/* Tactical Legend */}
                <div class="absolute bottom-6 right-6 p-4 bg-black/80 border border-white/10 rounded-xl backdrop-blur-xl z-10 pointer-events-none">
                   <div class="flex flex-col gap-2">
                      <div class="flex items-center gap-3">
                         <div class="w-2 h-2 rounded-full bg-primary shadow-primary"></div>
                         <span class="mono-xs text-slate-500 font-bold uppercase">Authorized_Node</span>
                      </div>
                      <div class="flex items-center gap-3">
                         <div class="w-2 h-2 rounded-full bg-danger shadow-danger"></div>
                         <span class="mono-xs text-slate-500 font-bold uppercase">Malicious_Origin</span>
                      </div>
                   </div>
                </div>
             </div>
          </div>
          <div class="col-span-12 lg:col-span-4 t-panel glass-panel border-t-2 border-success/30 flex flex-col">
             <header class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                <h3 class="tactical-title text-base tracking-widest">DECEPTION_GRID</h3>
                <span class="mono-xs text-slate-700 font-black tracking-widest uppercase italic">ACTIVE_LURE</span>
             </header>
             <div class="flex-grow flex items-center justify-center min-h-[300px]">
                <honeypot-chart></honeypot-chart>
             </div>
             <footer class="mt-8 pt-6 border-t border-white/5">
                <div class="flex justify-between items-baseline mb-2">
                   <span class="mono-xs text-slate-500 font-bold uppercase">Strike_Back_Probability</span>
                   <span class="mono-xs text-white font-black italic tracking-widest tabular-nums">84.2%</span>
                </div>
                <div class="h-1 bg-white/5 rounded-full overflow-hidden">
                   <div class="h-full bg-danger animate-pulse" style="width: 84.2%"></div>
                </div>
             </footer>
          </div>
        </div>
      </section>
    </Layout>
  );
};
