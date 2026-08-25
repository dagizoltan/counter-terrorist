import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const ForensicCenterPage = (props: { csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Investigation Lab // Tactical Signal" islandPaths={[
      '/components/islands/TimelineIsland.js',
      '/components/islands/ReplayIsland.js',
      '/components/islands/BlockingLog.js',
      '/components/islands/ForensicVault.js',
      '/routes/ui--forensics/islands/CausalLineageIsland.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Investigation Lab</h1>
          <span class="subtitle">Post-mortem Causal Analysis & Temporal Replay Hub</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="flex items-center gap-4 bg-danger/10 border border-danger/30 px-4 py-4 rounded-full backdrop-blur-xl shadow-[0_0_20px_rgba(var(--danger-rgb),0.15)]">
              <span class="dot danger"></span>
              <span class="eyebrow" data-tone="danger">Live Ingress Stream</span>
           </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-4 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-danger/30 group flex flex-col transition-all hover:bg-white/[0.02]">
           <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-4">
                 <div class="p-4 bg-danger/10 border border-danger/30 text-danger rounded-lg">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                 </div>
                 <div class="flex flex-col gap-1.5">
                    <h3 class="tactical-title text-2xl tracking-widest uppercase">Live Signal Stream</h3>
                    <p class="eyebrow">Real-time forensic packet capture and policy enforcement</p>
                 </div>
              </div>
              <div class="flex gap-4">
                 <button class="t-btn px-4 py-3 text-[10px] font-black uppercase tracking-widest">Rewind Buffer</button>
                 {props.userRole === "admin" && (
                 <button class="t-btn danger px-4 py-3 text-[10px] font-black uppercase tracking-widest">Purge Logs</button>
                 )}
              </div>
           </header>
           <div class="p-4 bg-black/40 min-h-[600px] overflow-x-auto custom-scrollbar">
              <blocking-log id="main-log-full"></blocking-log>
           </div>
        </div>
      </div>

      <div class="grid grid-cols-12 gap-4 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">
        <div class="col-span-12">
           <forensic-vault></forensic-vault>
        </div>
      </div>

      <section class="animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200">
         <div class="grid grid-cols-12 gap-4">
            <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 border-t-2 border-slate-800 flex flex-col overflow-hidden group hover:bg-white/[0.02] transition-all">
               <header class="p-4 border-b border-white/5 bg-black/40 backdrop-blur-md flex justify-between items-center">
                  <h3 class="tactical-title text-sm uppercase tracking-widest text-slate-400">Temporal Causality Map</h3>
                  <span class="eyebrow">Window: 24H History</span>
               </header>
               <div class="p-4 bg-black/20 min-h-[300px] relative">
                  <timeline-island></timeline-island>
               </div>
            </div>

            <div class="col-span-12 lg:col-span-4 t-panel glass-panel p-0 border-t-2 border-primary/30 flex flex-col group hover:bg-white/[0.02] transition-all">
               <header class="p-4 border-b border-white/10 bg-black/40 backdrop-blur-md">
                  <h3 class="tactical-title text-sm uppercase tracking-widest text-primary">Causal Lineage Map</h3>
               </header>
               <div class="p-4 flex-grow bg-black/60 relative overflow-hidden custom-scrollbar max-h-[600px] overflow-y-auto">
                  <div id="causal-lineage-root"></div>
               </div>
               <footer class="p-4 border-t border-white/5 bg-black/40 flex flex-col gap-4">
                  {(props.userRole === "admin" || props.userRole === "operator") && (
                  <button onclick="document.querySelector('forensic-vault').generateBundle()" class="t-btn w-full py-4 text-[10px] font-black uppercase tracking-widest group/btn">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="mr-3"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
                     Generate Evidence Bundle
                  </button>
                  )}
               </footer>
            </div>
         </div>
      </section>

    </Layout>
  );
};
