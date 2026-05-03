import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Atomic Threat Map
 * Hardened tactical overlay with high-fidelity spatial intelligence.
 */
export default function ThreatMapPage(props: { status?: any; csrfToken?: string }) {
  const islandPaths = [
    '/components/islands/MetricsHydrator.js',
    '/components/islands/MeshHeatmap.js'
  ];

  return (
    <Layout title="Spatial Intelligence // Tactical Map" csrfToken={props.csrfToken} islandPaths={islandPaths}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Spatial Intelligence</h1>
          <span class="subtitle">Mesh Gossip Live // Propagation State: Stable</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="status-pill success pulse">Gossip Active</div>
        </div>
      </header>

      {/* 02_Tactical_Overlay */}
      <div class="grid grid-cols-12 gap-8 animate-fade-in" style="animation-delay: 100ms;">
        <div class="col-span-12 t-panel glass-panel p-0 relative border-t-2 border-slate-800" style="min-height:720px;">
           <header class="absolute top-8 left-8 z-10 flex flex-col gap-2">
              <div class="flex items-center gap-4 bg-black/80 backdrop-blur-md border border-white/5 px-6 py-3 rounded-lg shadow-2xl">
                 <div class="w-2 h-2 bg-primary rounded shadow-primary animate-pulse"></div>
                 <h3 class="tactical-title text-sm uppercase tracking-widest">TACTICAL_OVERLAY_ENGINE_V4</h3>
              </div>
              <div class="flex items-center gap-3 bg-black/60 px-4 py-2 rounded border border-white/5 self-start">
                 <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Grid_Reference: X-RAY_77</span>
              </div>
           </header>

           <div class="w-full h-full min-h-[720px] flex flex-col gap-6 p-10 bg-black/40 group overflow-hidden rounded-2xl">
              <mesh-heatmap></mesh-heatmap>
           </div>
           
           <div class="absolute bottom-10 left-10 z-10 flex gap-6 pointer-events-none">
              <div class="status-pill success">Threat_Low</div>
              <div class="status-pill danger pulse">Anomalous_Signal</div>
           </div>
        </div>

        {/* Intelligence Overlays */}
        <div class="col-span-12 lg:col-span-6 t-panel glass-panel group p-10 border-t-2 border-slate-800 transition-all hover:bg-white/[0.02]">
           <header class="flex items-center gap-6 mb-10 pb-6 border-b border-white/5">
              <div class="p-4 bg-success/10 border border-success/20 text-success rounded-lg shadow-success">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div class="flex flex-col gap-1">
                 <h3 class="tactical-title text-sm uppercase tracking-widest">DYNAMIC_DECEPTION_CORE</h3>
                 <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Morphing Honeypot Array</p>
              </div>
           </header>
           <p class="text-sm text-slate-400 leading-relaxed font-bold uppercase tracking-tight opacity-60 group-hover:opacity-100 transition-opacity italic">
             The **Morphing Engine** is currently rotating honeypot ports and canary breadcrumbs every 600s to invalidate attacker reconnaissance. Signal fidelity is synchronized across the mesh.
           </p>
        </div>

        <div class="col-span-12 lg:col-span-6 t-panel glass-panel group p-10 border-t-2 border-slate-800 transition-all hover:bg-white/[0.02]">
           <header class="flex items-center gap-6 mb-10 pb-6 border-b border-white/5">
              <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded-lg shadow-primary">
                 <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div class="flex flex-col gap-1">
                 <h3 class="tactical-title text-sm uppercase tracking-widest">KERNEL_ZERO-TRUST_SHIELD</h3>
                 <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest">eBPF LSM Enforcement</p>
              </div>
           </header>
           <p class="text-sm text-slate-400 leading-relaxed font-bold uppercase tracking-tight opacity-60 group-hover:opacity-100 transition-opacity italic">
             **eBPF LSM** is enforcing kernel-level access controls. Unauthorized processes attempting to read sensitive configuration files are blocked before execution via a hardened security manifest.
           </p>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
}
