import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Atomic Threat Map
 * Hardened tactical overlay with high-fidelity spatial intelligence.
 */
export default function ThreatMapPage() {
  return (
    <Layout title="Spatial Intelligence // Tactical Map">
      
      {/* 01_Header_Section */}
      <header class="flex justify-between items-end mb-16 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-primary rounded shadow-primary"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Spatial_Intel</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-primary animate-pulse"></span>
                <span class="mono-xs font-black text-primary tracking-widest uppercase">Mesh_Gossip_Live</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">Propagation_State: STABLE</div>
            </div>
          </div>
        </div>
      </header>

      {/* 02_Tactical_Overlay */}
      <div class="grid grid-cols-12 gap-8 animate-fade-in" style="animation-delay: 100ms;">
        <div class="col-span-12 t-panel glass-panel p-0 overflow-hidden relative border-t-2 border-slate-800" style="min-height:640px;">
           <header class="absolute top-8 left-8 z-10 flex flex-col gap-2">
              <div class="flex items-center gap-4 bg-black/80 backdrop-blur-md border border-white/5 px-6 py-3 rounded-lg shadow-2xl">
                 <div class="w-2 h-2 bg-primary rounded shadow-primary animate-pulse"></div>
                 <h3 class="tactical-title text-sm uppercase tracking-widest">TACTICAL_OVERLAY_ENGINE_V4</h3>
              </div>
              <div class="flex items-center gap-3 bg-black/60 px-4 py-2 rounded border border-white/5 self-start">
                 <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Grid_Reference: X-RAY_77</span>
              </div>
           </header>

           <div id="heatmap-island-container" class="w-full h-full flex flex-col items-center justify-center bg-black/40 group">
              <div class="flex flex-col items-center gap-6 opacity-30">
                 <div class="w-16 h-16 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-primary"></div>
                 <span class="mono-xs font-black text-primary uppercase tracking-[0.4em] animate-pulse">Initializing_Spatial_Engine...</span>
              </div>
           </div>
           
           <div class="absolute bottom-8 left-8 z-10 flex gap-4 pointer-events-none">
              <div class="px-6 py-3 bg-black/60 border border-white/5 rounded-full flex items-center gap-3">
                 <div class="w-2 h-2 bg-success rounded shadow-success"></div>
                 <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Threat_Low</span>
              </div>
              <div class="px-6 py-3 bg-black/60 border border-white/5 rounded-full flex items-center gap-3">
                 <div class="w-2 h-2 bg-danger rounded shadow-danger"></div>
                 <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Anomalous_Signal</span>
              </div>
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

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { h, render } from '/vendor/preact.js';
        import MeshHeatmap from '/components/islands/MeshHeatmap.js';
        
        const container = document.getElementById('heatmap-island-container');
        if (container) {
          container.innerHTML = ''; // Clear loader
          render(h(MeshHeatmap), container);
        }
      `}} />
    </Layout>
  );
}
