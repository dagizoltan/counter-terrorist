import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Mesh Topology Page
 * P2P coordination and consensus management.
 */
export const MeshTopologyPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Mesh Topology" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/MeshGraph.js',
      '/components/islands/MeshHeatmap.js'
    ]} csrfToken={props.csrfToken}>
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-green); border-radius:4px; box-shadow:0 0 20px var(--cyber-green-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">MESH_TOPOLOGY</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">P2P Coordination // Consensus Governance // Protocol Mimicry</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">01_TOPOLOGY_VIEW</h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:2rem; margin-bottom:2rem;">
          {/* MESH GRAPH VIEW */}
          <div style="grid-column: span 2;" class="glass-panel">
             <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                   <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
                   </div>
                   <h3 class="mono-label" style="color:white; opacity:0.8;">Active_Node_Topology</h3>
                </div>
                <div style="display:flex; align-items:center; gap:1rem;">
                   <span id="stat-mesh-nodes" class="mono-label" style="color:var(--cyber-blue);">0 Nodes</span>
                </div>
             </div>
             <div style="height:500px; position:relative;">
                <mesh-graph></mesh-graph>
             </div>
          </div>

          {/* CONSENSUS & SYNC */}
          <div class="glass-panel" style="border-left:4px solid var(--cyber-green);">
             <div style="display:flex; align-items:center; gap:0.75rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); margin-bottom:2rem;">
                <div style="padding:0.5rem; background:var(--cyber-green-glow); border-radius:0.5rem; color:var(--cyber-green);">
                   <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                </div>
                <h3 class="mono-label" style="color:var(--cyber-green);">Consensus_Health</h3>
             </div>
             
             <div style="flex-grow:1; display:flex; flex-direction:column; gap:2rem; margin-bottom:2rem;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                   <span class="mono-label" style="opacity:0.5;">Quorum_Status</span>
                   <span id="stat-mesh-quorum" class="mono-label" style="color:var(--cyber-green); font-style:italic;">Established</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                   <span class="mono-label" style="opacity:0.5;">Verified_Nodes</span>
                   <span id="stat-mesh-nodes" class="mono-label" style="color:white;">0 / 0</span>
                </div>
             </div>

             <div style="padding-top:1.5rem; border-top:1px solid var(--border-color);">
                <button 
                  onclick="fetch('/api/mesh/resync', { method: 'POST' }).then(() => alert('Mesh re-synchronization broadcasted.'))"
                  class="tactical-button"
                  style="width:100%; background:var(--cyber-green); color:black; border:none;"
                >
                  Broadcast_Mesh_Sync
                </button>
             </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">02_TRAFFIC_CAMOUFLAGE</h2>
        <div class="tactical-grid">
           <div class="glass-panel" style="display:flex; gap:2rem; align-items:center;">
              <div style="padding:1.5rem; background:var(--cyber-blue-glow); border-radius:1rem; color:var(--cyber-blue);">
                 <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div style="flex-grow:1;">
                 <span class="mono-label" style="opacity:0.4; margin-bottom:0.5rem; display:block;">Active_Camouflage_Mode</span>
                 <div style="font-size:1.5rem; font-weight:900; color:white; font-style:italic;">Protocol_Mimicry</div>
                 <p class="mono-label" style="color:var(--cyber-blue); opacity:0.6; margin-top:0.5rem;">Target: Chrome_v124_Win11</p>
              </div>
              <button class="tactical-button" style="padding:0.5rem 1.5rem;">Configure</button>
           </div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
