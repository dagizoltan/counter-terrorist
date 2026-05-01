import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const MeshTopologyPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Mesh Topology" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/MeshGraph.js',
      '/components/islands/MeshHeatmap.js'
    ]} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Sovereign_Mesh_Topology</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">P2P Coordination // Consensus Governance</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {/* MESH GRAPH VIEW */}
        <div class="lg:col-span-2 glass-panel rounded-xl border border-white/5 p-8 h-[600px] relative overflow-hidden">
           <div class="flex justify-between items-center mb-8">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60">Active_Node_Topology</h3>
              <div class="flex items-center gap-4">
                 <span id="stat-mesh-nodes" class="text-[10px] font-mono text-cyber">0 Nodes</span>
              </div>
           </div>
           <mesh-graph></mesh-graph>
        </div>

        {/* CONSENSUS & SYNC */}
        <div class="space-y-8">
           <div class="glass-panel rounded-xl border border-emerald-500/10 p-8 shadow-[0_0_50px_rgba(16,185,129,0.03)]">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 mb-8 pb-4 border-b border-emerald-500/10">Layer-02 // Consensus_Health</h3>
              <div class="space-y-6">
                 <div class="flex justify-between items-center">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quorum_Status</span>
                    <span id="stat-mesh-quorum" class="text-xs font-black text-emerald-500 italic">ESTABLISHED</span>
                 </div>
                 <div class="flex justify-between items-center">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Verified_Nodes</span>
                    <span id="stat-mesh-nodes" class="text-xs font-black text-white">0 / 0</span>
                 </div>
                 <div class="pt-8 border-t border-white/5">
                    <button 
                      onclick="fetch('/api/mesh/resync', { method: 'POST' }).then(() => alert('Mesh re-synchronization broadcasted.'))"
                      class="w-full py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all"
                    >
                      Broadcast_Mesh_Sync
                    </button>
                 </div>
              </div>
           </div>

           <div class="glass-panel rounded-xl border border-white/5 p-8">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60 mb-8 pb-4 border-b border-white/5">Layer-02 // Traffic_Camouflage</h3>
              <div class="space-y-4">
                 <div class="flex justify-between items-center">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mode</span>
                    <span class="text-[10px] font-black text-cyber uppercase">Protocol_Mimicry</span>
                 </div>
                 <div class="flex justify-between items-center">
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target</span>
                    <span class="text-[10px] font-mono text-white/60 uppercase">Chrome/Win10</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
