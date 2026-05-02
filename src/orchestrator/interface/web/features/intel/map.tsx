import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Atomic Threat Map
 * Hardened tactical overlay with zero-class dependency.
 */
export default function ThreatMapPage() {
  const styles = {
    card: "padding:2rem; border-radius:1.5rem; background:rgba(15,23,42,0.4); border:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; gap:1rem;",
    headerLine: "width:32px; height:1px; background:#10b981;",
    label: "font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.4em; color:#10b981;"
  };

  return (
    <Layout title="Mesh Heatmap // Autonomous Defense Mesh">
      <div style="padding:2rem; max-width:1200px; margin:0 auto;">
        <header style="margin-bottom:3rem;">
          <div style="display:flex; align-items:center; gap:1rem; margin-bottom:0.5rem;">
            <div style={styles.headerLine}></div>
            <span style={styles.label}>Spatial Intelligence</span>
          </div>
          <h1 style="font-size:3.5rem; font-weight:900; letter-spacing:-0.05em; color:white; margin:0 0 1rem 0; font-style:italic; text-transform:uppercase;">
            TACTICAL_OVERLAY
          </h1>
          <p style="font-size:14px; font-weight:500; color:rgba(148,163,184,0.6); line-height:1.6; max-width:800px;">
            Real-time visualization of mesh propagation and gossip traffic. Watch threat signatures ripple through the peer network as the grid autonomously synchronizes its defensive posture.
          </p>
        </header>

        <div id="heatmap-island-container" style="min-height:400px; background:rgba(0,0,0,0.2); border-radius:2rem; border:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center;">
           {/* MeshHeatmap.js will be hydrated here */}
           <div style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.2em; color:rgba(148,163,184,0.3); font-style:italic;">Initializing_Spatial_Engine...</div>
        </div>

        <div style="margin-top:3rem; display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:2rem;">
           <div style={styles.card}>
              <h3 style="font-size:1.1rem; font-weight:900; color:white; margin:0; display:flex; align-items:center; gap:0.5rem; text-transform:uppercase; italic;">
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                 Dynamic Deception Active
              </h3>
              <p style="font-size:13px; color:rgba(148,163,184,0.6); line-height:1.6; margin:0;">
                The **Morphing Engine** is currently rotating honeypot ports and canary breadcrumbs every 10 minutes to invalidate attacker reconnaissance.
              </p>
           </div>
           <div style={styles.card}>
              <h3 style="font-size:1.1rem; font-weight:900; color:white; margin:0; display:flex; align-items:center; gap:0.5rem; text-transform:uppercase; italic;">
                 <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0ea5e9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                 Kernel Zero-Trust
              </h3>
              <p style="font-size:13px; color:rgba(148,163,184,0.6); line-height:1.6; margin:0;">
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
