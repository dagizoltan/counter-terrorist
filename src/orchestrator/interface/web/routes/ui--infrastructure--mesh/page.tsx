import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Mesh Topology Page
 * High-fidelity P2P consensus and node discovery visualization.
 */
export const MeshTopologyPage = (props: { status: any, csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Mesh Topology // P2P Consensus" islandPaths={[
      '/components/islands/MeshGraph.js',
      '/components/islands/MeshHeatmap.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Mesh Topology</h1>
          <span class="subtitle">P2P Consensus Reached // Nodes Discovered: {props.status?.mesh?.nodes?.length || "0"}</span>
        </div>
        <div class="flex gap-4">
          {(props.userRole === "admin" || props.userRole === "operator") && (
          <button class="t-btn px-8 py-4 text-[10px] font-black group" onclick="fetch('/api/mesh/resync', { method: 'POST' })">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-2"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            Broadcast Sync
          </button>
          )}
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 border-t-2 border-primary/30 group hover:bg-white/[0.02] transition-all">
          <header class="p-6 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex items-center gap-4">
              <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-xl">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <div class="flex flex-col gap-2">
                 <h3 class="tactical-title text-xl tracking-widest uppercase">Node Graph Reconstruction</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-1">Live peer-to-peer adjacency matrix</p>
              </div>
            </div>
            <div class="flex items-center gap-6 bg-black/40 px-8 py-3 rounded-full border border-white/5 backdrop-blur-md">
               <span class="dot active"></span>
               <span id="stat-mesh-nodes" class="mono-xs font-bold text-success tracking-widest uppercase italic">0 Active Peers</span>
            </div>
          </header>
          <div class="bg-black/60 h-[700px] relative overflow-hidden">
            <mesh-graph></mesh-graph>
            <div class="absolute bottom-10 right-10 flex flex-col gap-4 pointer-events-none opacity-40">
               <div class="flex items-center gap-4 justify-end">
                  <span class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em]">Signal Fidelity</span>
                  <div class="flex gap-2">
                     <div class="w-1.5 h-4 bg-success rounded-full"></div>
                     <div class="w-1.5 h-4 bg-success rounded-full"></div>
                     <div class="w-1.5 h-4 bg-success rounded-full"></div>
                     <div class="w-1.5 h-4 bg-success/20 rounded-full"></div>
                  </div>
               </div>
            </div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div class="t-panel glass-panel border-t-4 border-success group hover:bg-white/[0.02] transition-all">
            <div class="flex justify-between items-start mb-12 pb-8 border-b border-white/10">
              <div class="flex flex-col gap-2">
                 <h3 class="tactical-title text-xl tracking-widest uppercase">Consensus State</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em]">Byzantine Fault Tolerance</p>
              </div>
              <div class="status-pill success active text-[9px] tracking-widest">VERIFIED</div>
            </div>
            
            <div class="flex flex-col gap-4 mb-12">
              <div class="flex justify-between items-center p-8 bg-black/60 border border-white/5 rounded-2xl group/item transition-colors hover:border-success/30">
                <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-success transition-colors">Quorum Status</span>
                <span id="stat-mesh-quorum" class="mono-md font-black text-success tracking-widest uppercase italic">ESTABLISHED</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/60 border border-white/5 rounded-2xl group/item transition-colors hover:border-primary/30">
                <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Identity Weights</span>
                <span class="mono-md font-black text-white tracking-widest uppercase">BALANCED</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/60 border border-white/5 rounded-2xl group/item transition-colors hover:border-success/30">
                <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-success transition-colors">Net Partition</span>
                <span class="mono-md font-black text-success tracking-widest uppercase">NONE</span>
              </div>
            </div>

            <div class="p-8 bg-success/5 border border-success/20 rounded-2xl relative overflow-hidden group/alert">
               <div class="absolute top-0 right-0 p-6 opacity-5 group-hover/alert:opacity-10 transition-opacity">
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
               </div>
               <p class="mono-xs text-slate-500 font-black uppercase leading-loose tracking-widest italic relative z-10">
                 Sovereign nodes are currently synchronizing state via mTLS. Consensus threshold is maintained at <span class="text-success">2/3 + 1</span>.
               </p>
            </div>
          </div>

          <div class="t-panel glass-panel border-t-2 border-primary/30 group hover:bg-white/[0.04] transition-all">
            <h3 class="tactical-title text-sm mb-12 uppercase tracking-[0.4em] text-slate-400">Mimicry Camouflage</h3>
            <div class="flex items-center gap-4 p-8 bg-black/60 rounded-2xl border border-white/10 group/item hover:border-primary/40 transition-colors">
               <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
               </div>
               <div>
                  <div class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em] mb-2">Protocol Mimicry</div>
                  <div class="mono-md font-black text-white uppercase tracking-widest leading-none">CHROME_V124_WIN11</div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <section class="animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-100">
        <div class="flex items-center gap-6 mb-10 pb-4 border-b border-white/5">
           <div class="w-12 h-1.5 bg-primary rounded-full"></div>
           <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">Mesh Traffic Heatmap Propagation</h2>
        </div>
        <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 relative group transition-all hover:bg-white/[0.02]">
           <div class="h-[350px] relative">
              <mesh-heatmap></mesh-heatmap>
              <div class="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/80 to-transparent"></div>
              <div class="absolute bottom-10 left-10 z-10">
                 <div class="flex items-center gap-6 bg-black/60 border border-white/10 px-8 py-4 rounded-full backdrop-blur-2xl">
                    <div class="flex items-center gap-4">
                       <div class="w-3 h-3 bg-danger rounded-full"></div>
                       <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">Congestion Zone</span>
                    </div>
                    <div class="w-px h-4 bg-white/10"></div>
                    <div class="flex items-center gap-4">
                       <div class="w-3 h-3 bg-success rounded-full shadow-[0_0_10px_var(--success)]"></div>
                       <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">Optimal Flow</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

    </Layout>
  );
};
