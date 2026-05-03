import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export default function ForensicReplay(props: { csrfToken?: string }) {
  return (
    <Layout title="Forensic Replay // Autonomous Defense Mesh" csrfToken={props.csrfToken}>
      <div class="animate-fade-in">
        {/* 1. Header Section */}
        <header class="page-header mb-16">
          <div class="title-group">
            <h1>Forensic Replay</h1>
            <span class="subtitle">Post-Mortem Engine Active // Mode: High-Fidelity Reconstruction</span>
          </div>
          <div class="flex items-center gap-6">
             <div class="flex items-center gap-4 bg-danger/10 border border-danger/30 px-8 py-4 rounded-full shadow-danger/20">
                <span class="dot danger pulse shadow-danger"></span>
                <span class="mono-xs font-black text-danger tracking-[0.4em] uppercase">Engine_Engaged</span>
             </div>
          </div>
        </header>

        {/* 2. Replay Engine Island */}
        <div class="grid grid-cols-12 gap-10">
           <div class="col-span-12">
              <div id="replay-island-container" class="min-h-[850px] t-panel glass-panel p-0 overflow-hidden border-t-2 border-danger/30 group">
                 <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
                    <div class="flex items-center gap-8">
                       <div class="p-4 bg-danger/10 border border-danger/30 text-danger rounded-xl shadow-danger/20 group-hover:scale-110 transition-transform duration-500">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                       </div>
                       <div>
                          <h2 class="tactical-title text-2xl tracking-widest">POST-MORTEM_RECONSTRUCTION_DOMAIN</h2>
                          <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Temporal playback of mesh-wide security incursions</p>
                       </div>
                    </div>
                    <div class="px-8 py-4 bg-black/60 border border-white/10 rounded-full shadow-inner">
                       <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">FILESYSTEM: <span class="text-white">MOUNTED_RO</span></span>
                    </div>
                 </header>

                 <div class="bg-black/20 p-2 relative">
                    <div class="absolute inset-0 pointer-events-none opacity-[0.02] bg-[radial-gradient(circle_at_center,_var(--danger)_0%,_transparent_70%)]"></div>
                    {/* ReplayIsland.js will be hydrated here */}
                    <div class="t-panel glass-panel text-center p-64 border-dashed border-white/5 opacity-20">
                       <div class="flex flex-col items-center gap-10">
                          <div class="w-16 h-16 border-2 border-danger border-t-transparent rounded-full animate-spin shadow-danger"></div>
                          <span class="mono-xs font-black animate-pulse text-danger uppercase tracking-[0.6em]">Mounting_Forensic_Filesystem...</span>
                       </div>
                    </div>
                 </div>
                 
                 <footer class="p-10 border-t border-white/10 bg-black/40 flex justify-center">
                    <p class="mono-xs text-slate-600 font-black uppercase tracking-[0.5em] italic">
                       Interactive scrub active // All temporal nodes synchronized via consensus
                    </p>
                 </footer>
              </div>
           </div>
        </div>
      </div>

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { h, render } from '/vendor/preact.js';
        import ReplayIsland from '/components/islands/ReplayIsland.js';
        
        const container = document.getElementById('replay-island-container');
        if (container) {
          container.innerHTML = ''; // Clear loader
          render(h(ReplayIsland), container);
        }
      `}} />
    </Layout>
  );
}
