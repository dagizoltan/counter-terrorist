import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export default function ForensicReplay(props: { csrfToken?: string }) {
  return (
    <Layout title="Forensic Replay // Autonomous Defense Mesh" csrfToken={props.csrfToken}>
      <div class="animate-fade-in">
        {/* 1. Header Section */}
        <header class="flex justify-between items-end mb-12">
          <div class="flex items-center gap-8">
            <div class="w-3 h-16 bg-danger rounded shadow-danger"></div>
            <div class="flex flex-col gap-2">
              <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Forensic_Replay</h1>
              <div class="flex items-center gap-6">
                <div class="flex items-center gap-2">
                  <span class="dot danger pulse shadow-danger"></span>
                  <span class="mono-xs font-black text-danger tracking-widest uppercase">POST-MORTEM_ENGINE_ACTIVE</span>
                </div>
                <span class="text-slate-700">/</span>
                <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">MODE: HIGH_FIDELITY_RECONSTRUCTION</div>
              </div>
            </div>
          </div>
          <p class="text-slate-500 max-w-md font-bold uppercase tracking-tight text-[10px] text-right leading-relaxed">
            Reconstruct security incidents in high fidelity. <br/> 
            Scrub through the mesh timeline to visualize threat propagation, <br/>
            agent responses, and the chain of custody.
          </p>
        </header>

        {/* 2. Replay Engine Island */}
        <div id="replay-island-container" class="min-h-[800px]">
           {/* ReplayIsland.js will be hydrated here */}
           <div class="t-panel glass-panel text-center p-32 border-dashed opacity-30">
              <span class="mono-xs font-black animate-pulse text-primary uppercase tracking-[0.4em]">Mounting_Forensic_Filesystem...</span>
           </div>
        </div>
      </div>

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { h, render } from '/vendor/preact.js';
        import ReplayIsland from '/components/islands/ReplayIsland.js';
        
        const container = document.getElementById('replay-island-container');
        if (container) {
          render(h(ReplayIsland), container);
        }
      `}} />
    </Layout>
  );
}
