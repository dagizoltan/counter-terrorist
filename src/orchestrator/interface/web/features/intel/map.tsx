import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Atomic Threat Map
 * Hardened tactical overlay with CSS-driven design system.
 */
export default function ThreatMapPage() {
  return (
    <Layout title="Mesh Heatmap // Autonomous Defense Mesh">
      <div style="max-width:1200px; margin:0 auto;">
        <header style="margin-bottom:3rem;">
          <div class="section-header">Spatial Intelligence</div>
          <h1 style="font-size:3.5rem; color:white; margin:0 0 1rem 0; font-style:italic;">
            TACTICAL_OVERLAY
          </h1>
          <p style="font-size:14px; font-weight:500; color:var(--text-secondary); line-height:1.6; max-width:800px;">
            Real-time visualization of mesh propagation and gossip traffic. Watch threat signatures ripple through the peer network as the grid autonomously synchronizes its defensive posture.
          </p>
        </header>

        <div id="heatmap-island-container" class="glass-panel" style="min-height:500px; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.4);">
           <div class="mono-label pulse" style="color:var(--text-muted); font-style:italic;">Initializing_Spatial_Engine...</div>
        </div>

        <div class="tactical-grid" style="margin-top:3rem; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr));">
           <div class="glass-panel">
              <h3 style="font-size:1.1rem; color:white; margin:0 0 1rem 0; display:flex; align-items:center; gap:0.75rem; font-style:italic;">
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyber-green)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                 Dynamic Deception Active
              </h3>
              <p style="font-size:13px; color:var(--text-secondary); line-height:1.6; margin:0;">
                The **Morphing Engine** is currently rotating honeypot ports and canary breadcrumbs every 10 minutes to invalidate attacker reconnaissance.
              </p>
           </div>
           <div class="glass-panel">
              <h3 style="font-size:1.1rem; color:white; margin:0 0 1rem 0; display:flex; align-items:center; gap:0.75rem; font-style:italic;">
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--cyber-blue)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                 Kernel Zero-Trust
              </h3>
              <p style="font-size:13px; color:var(--text-secondary); line-height:1.6; margin:0;">
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
          container.innerHTML = ''; // Clear loader
          render(h(MeshHeatmap), container);
        }
      `}} />
    </Layout>
  );
}
