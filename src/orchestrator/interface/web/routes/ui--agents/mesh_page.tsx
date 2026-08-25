import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Mesh Agent Page
 * Peer discovery, mTLS gossip protocol, and distributed consensus.
 */
export const MeshPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout title="Mesh Agent // Peer Intelligence" islandPaths={[
      '/components/islands/NetworkMap.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>Mesh Agent</h1>
          <span class="subtitle">Distributed P2P Fabric & Peer Consensus // Status: Operational</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-4 mb-4">
        <div class="col-span-12 lg:col-span-8">
          <div class="t-panel glass-panel p-0 border-t-2 border-primary group overflow-hidden">
             <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
                <div class="flex items-center gap-4">
                  <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M17 12V17a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-5"/><circle cx="12" cy="12" r="3"/></svg>
                  </div>
                  <div class="flex flex-col gap-2">
                     <h3 class="tactical-title text-2xl tracking-widest">PEER FABRIC TOPOLOGY</h3>
                     <p class="eyebrow">Global mesh distribution and mTLS tunnel health</p>
                  </div>
                </div>
                <div class="status-pill active font-black tracking-widest">QUORUM OK</div>
             </header>

             <div class="h-[600px] relative bg-black/60">
                <network-map></network-map>
             </div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-4 flex flex-col gap-4">
           <div class="t-panel glass-panel border-t-2 border-slate-700">
              <h3 class="tactical-title text-xs uppercase tracking-[0.3em] text-slate-400 mb-4 pb-4 border-b border-white/5">MESH TELEMETRY</h3>
              <div class="space-y-4">
                 <div class="flex justify-between items-center p-4 bg-black/40 rounded-lg border border-white/5">
                    <span class="eyebrow">Active Peers</span>
                    <span class="text-4xl font-black text-white tabular-nums tracking-tighter">{props.status.mesh?.nodes || 0}</span>
                 </div>
                 <div class="flex justify-between items-center p-4 bg-black/40 rounded-lg border border-white/5">
                    <span class="eyebrow">Traffic Volume</span>
                    <span class="text-4xl font-black text-primary tabular-nums tracking-tighter">1.4 GB</span>
                 </div>
                 <div class="flex justify-between items-center p-4 bg-black/40 rounded-lg border border-white/5">
                    <span class="eyebrow">Protocol</span>
                    <span class="eyebrow" data-tone="success">mTLS_GOSSIP_V2</span>
                 </div>
              </div>
           </div>

           <div class="t-panel glass-panel border-t-2 border-warning flex-grow">
              <h3 class="tactical-title text-xs uppercase tracking-[0.3em] text-slate-400 mb-4 pb-4 border-b border-white/5">COMMAND DISPATCH</h3>
              <div class="space-y-4">
                 <button type="button" class="t-btn w-full py-4 text-[10px] font-black uppercase tracking-widest">Broadcast Global Sweep</button>
                 <button type="button" class="t-btn w-full py-4 text-[10px] font-black uppercase tracking-widest">Rotate Mesh Keys</button>
                 <button type="button" class="t-btn w-full py-4 text-[10px] font-black uppercase tracking-widest danger">Initiate Mesh Lockdown</button>
              </div>
           </div>
        </div>
      </div>
    </Layout>
  );
};
