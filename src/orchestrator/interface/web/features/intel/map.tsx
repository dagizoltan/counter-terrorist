import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export default function ThreatMapPage() {
  return (
    <Layout title="Mesh Heatmap // Autonomous Defense Mesh">
      <div class="p-8 max-w-7xl mx-auto">
        <header class="mb-12">
          <div class="flex items-center gap-3 mb-2">
            <div class="h-[1px] w-8 bg-green-500"></div>
            <span class="text-[10px] font-black uppercase tracking-[0.4em] text-green-500">Spatial Intelligence</span>
          </div>
          <h1 class="text-5xl font-black tracking-tighter text-white mb-4 italic">
            TACTICAL_OVERLAY
          </h1>
          <p class="text-slate-500 max-w-2xl font-medium leading-relaxed">
            Real-time visualization of mesh propagation and gossip traffic. Watch threat signatures ripple through the peer network as the grid autonomously synchronizes its defensive posture.
          </p>
        </header>

        <div id="heatmap-island-container">
           {/* MeshHeatmap.js will be hydrated here */}
        </div>

        <div class="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
           <div class="bg-white/5 border border-white/10 rounded-2xl p-8">
              <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-green-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                 Dynamic Deception active
              </h3>
              <p class="text-sm text-slate-500 leading-relaxed">
                The **Morphing Engine** is currently rotating honeypot ports and canary breadcrumbs every 10 minutes to invalidate attacker reconnaissance.
              </p>
           </div>
           <div class="bg-white/5 border border-white/10 rounded-2xl p-8">
              <h3 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
                 Kernel Zero-Trust
              </h3>
              <p class="text-sm text-slate-500 leading-relaxed">
                **eBPF LSM** is enforcing kernel-level access controls. Unauthorized processes attempting to read sensitive configuration files are blocked before execution.
              </p>
           </div>
        </div>
      </div>

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { h, render } from '/vendor/preact.js';
        import MeshHeatmap from '/components/islands/MeshHeatmap.js';
        
        const container = document.getElementById('heatmap-island-container');
        if (container) {
          render(h(MeshHeatmap), container);
        }
      `}} />
    </Layout>
  );
}
