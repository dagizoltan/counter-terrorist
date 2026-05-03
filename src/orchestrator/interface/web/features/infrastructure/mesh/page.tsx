import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Mesh Topology Page
 * High-fidelity P2P consensus and node discovery visualization.
 */
export const MeshTopologyPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Mesh Topology // P2P Consensus" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/MeshGraph.js',
      '/components/islands/MeshHeatmap.js'
    ]} csrfToken={props.csrfToken}>
      
      {/* 01_Header_Section */}
      <header class="flex justify-between items-end mb-16 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-success rounded shadow-success"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Mesh_Topology</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-success"></span>
                <span class="mono-xs font-black text-success tracking-widest uppercase">P2P_Consensus_Reached</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">Nodes_Discovered: {props.status?.mesh?.nodes?.length || "00"}</div>
            </div>
          </div>
        </div>
        <div class="flex gap-4 mb-2">
          <button class="t-btn group px-6 py-3" onclick="fetch('/api/mesh/resync', { method: 'POST' })">
             <span class="relative z-10">Broadcast_Sync_Signal</span>
          </button>
        </div>
      </header>

      {/* 02_Grid_Architecture */}
      <div class="grid grid-cols-12 gap-8 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        {/* Node Topology Graph */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-800">
          <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
            <div class="flex items-center gap-4">
              <div class="p-3 bg-success/10 border border-success/20 text-success rounded shadow-success">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div class="flex flex-col gap-1">
                 <h3 class="tactical-title text-lg uppercase tracking-widest leading-none">NODE_GRAPH_RECONSTRUCTION</h3>
                 <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Live peer-to-peer adjacency matrix</p>
              </div>
            </div>
            <div class="flex items-center gap-3 bg-black/40 px-4 py-2 rounded border border-white/5">
               <span class="dot active shadow-success"></span>
               <span id="stat-mesh-nodes" class="mono-xs font-black text-success tracking-widest uppercase italic">0 Active Peers</span>
            </div>
          </header>
          <div class="bg-black/40 h-[640px] relative overflow-hidden group">
            <mesh-graph></mesh-graph>
            <div class="absolute bottom-6 right-6 flex flex-col gap-2 pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity">
               <div class="flex items-center gap-3 justify-end">
                  <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Signal_Fidelity</span>
                  <div class="flex gap-1">
                     <div class="w-1 h-3 bg-success rounded-full shadow-success"></div>
                     <div class="w-1 h-3 bg-success rounded-full shadow-success"></div>
                     <div class="w-1 h-3 bg-success rounded-full shadow-success"></div>
                     <div class="w-1 h-3 bg-success/20 rounded-full"></div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Consensus & Operational Health */}
        <div class="col-span-12 lg:col-span-4 flex flex-col gap-8">
          <div class="t-panel glass-panel border-t-4 border-success p-10">
            <div class="flex justify-between items-start mb-12 pb-6 border-b border-white/5">
              <div class="flex flex-col gap-1">
                 <h3 class="tactical-title text-sm uppercase tracking-widest">CONSENSUS_STATE</h3>
                 <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Byzantine Fault Tolerance</p>
              </div>
              <div class="status-pill active py-1 px-4 shadow-success/20 animate-pulse">VERIFIED</div>
            </div>
            
            <div class="flex flex-col gap-8 mb-12">
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                <span class="metric-tag">Quorum_Status</span>
                <span id="stat-mesh-quorum" class="text-xl font-black text-success tracking-tighter uppercase italic">ESTABLISHED</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                <span class="metric-tag">Identity_Weights</span>
                <span class="text-xl font-black text-white tracking-tighter uppercase">BALANCED</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                <span class="metric-tag">Net_Partition</span>
                <span class="text-xl font-black text-success tracking-tighter uppercase">NONE</span>
              </div>
            </div>

            <div class="p-6 bg-success/5 border border-success/20 rounded-lg relative overflow-hidden">
               <div class="absolute top-0 right-0 p-4 opacity-10">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
               </div>
               <p class="mono-xs text-slate-500 font-bold uppercase leading-relaxed italic">
                 Sovereign nodes are currently synchronizing state via mTLS. Consensus threshold is maintained at <span class="text-success">2/3 + 1</span>.
               </p>
            </div>
          </div>

          <div class="t-panel glass-panel p-10">
            <h3 class="tactical-title text-sm mb-10 uppercase tracking-widest">MIMICRY_CAMOUFLAGE</h3>
            <div class="flex items-center gap-6 p-6 bg-black/40 rounded-xl border border-white/5 group hover:border-primary/40 transition-all">
               <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded-lg shadow-primary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
               </div>
               <div>
                  <div class="metric-tag text-[10px] mb-1">Protocol_Mimicry</div>
                  <div class="text-xl font-black text-white tracking-tighter uppercase">CHROME_V124_WIN11</div>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* 03_Traffic_Heatmap */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">03_MESH_TRAFFIC_HEATMAP_PROPAGATION</h2>
        <div class="t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-800">
           <div class="h-[300px] relative">
              <mesh-heatmap></mesh-heatmap>
              <div class="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 to-transparent"></div>
              <div class="absolute bottom-8 left-8">
                 <div class="flex items-center gap-4">
                    <div class="flex items-center gap-2">
                       <div class="w-3 h-3 bg-danger rounded shadow-danger"></div>
                       <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Congestion_Zone</span>
                    </div>
                    <div class="flex items-center gap-2">
                       <div class="w-3 h-3 bg-success rounded shadow-success"></div>
                       <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Optimal_Flow</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
