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
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-emerald-500 rounded-full"></span>
          MESH_TOPOLOGY
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">P2P Coordination // Consensus Governance // Protocol Mimicry</p>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_TOPOLOGY_VIEW
        </h2>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* MESH GRAPH VIEW */}
          <div class="lg:col-span-2 glass-panel rounded-3xl border border-white/5 p-10 h-[700px] relative overflow-hidden group hover:border-white/10 transition-all">
             <div class="flex justify-between items-center mb-10 pb-4 border-b border-white/5">
                <div class="flex items-center gap-4">
                   <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
                   </div>
                   <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/80">Active_Node_Topology</h3>
                </div>
                <div class="flex items-center gap-4">
                   <span id="stat-mesh-nodes" class="text-[11px] font-mono font-black text-cyber">0 Nodes</span>
                </div>
             </div>
             <mesh-graph></mesh-graph>
          </div>

          {/* CONSENSUS & SYNC */}
          <div class="space-y-8">
             <div class="glass-panel rounded-3xl border border-emerald-500/10 p-10 border-l-4 border-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.03)] flex flex-col h-full group hover:border-emerald-500/30 transition-all">
                <div class="flex items-center gap-4 mb-10 pb-4 border-b border-emerald-500/10">
                   <div class="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                   </div>
                   <h3 class="text-xs font-black uppercase tracking-[0.2em] text-emerald-400">Consensus_Health</h3>
                </div>
                
                <div class="flex-grow space-y-10">
                   <div class="flex justify-between items-center">
                      <span class="text-[11px] font-black text-slate-400 uppercase tracking-widest">Quorum_Status</span>
                      <span id="stat-mesh-quorum" class="text-xs font-black text-emerald-500 italic uppercase">Established</span>
                   </div>
                   <div class="flex justify-between items-center">
                      <span class="text-[11px] font-black text-slate-400 uppercase tracking-widest">Verified_Nodes</span>
                      <span id="stat-mesh-nodes" class="text-xs font-black text-white">0 / 0</span>
                   </div>
                </div>

                <div class="pt-8 border-t border-white/5">
                   <button 
                     onclick="fetch('/api/mesh/resync', { method: 'POST' }).then(() => alert('Mesh re-synchronization broadcasted.'))"
                     class="w-full py-5 bg-emerald-500 text-[10px] font-black uppercase tracking-[0.3em] rounded-xl transition-all hover:bg-emerald-600 shadow-[0_10px_20px_-10px_rgba(16,185,129,0.5)]"
                   >
                     Broadcast_Mesh_Sync
                   </button>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          02_TRAFFIC_CAMOUFLAGE
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
           <div class="glass-panel rounded-3xl border border-white/5 p-10 flex flex-col md:flex-row gap-8 items-center">
              <div class="p-6 bg-cyber/10 rounded-2xl text-cyber">
                 <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div class="flex-grow text-center md:text-left">
                 <span class="text-[10px] font-black text-slate-500 tracking-widest uppercase block mb-2">Active_Camouflage_Mode</span>
                 <div class="text-2xl font-black text-white uppercase italic tracking-tighter">Protocol_Mimicry</div>
                 <p class="text-[10px] font-mono text-cyber/60 mt-2 uppercase">Target: Chrome_v124_Win11</p>
              </div>
              <button class="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all">Configure</button>
           </div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
