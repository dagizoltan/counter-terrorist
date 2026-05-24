import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Network Agent Page
 * Topology discovery, packet capture, and mesh visualization.
 */
export const NetworkPage = (props: { status: unknown, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout title="Network Agent // Operational Discovery" islandPaths={[
      '/components/islands/NetworkMap.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>Network_Agent</h1>
          <span class="subtitle">Mesh Topology & Deep Packet Inspection // Discovery: Active</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-primary/30">
          <header class="p-6 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-xl tracking-widest">MESH_TOPOLOGY</h3>
               <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Live egress mesh visualization</p>
            </div>
            <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-6 py-2 rounded-full">
               <span class="dot active"></span>
               <span class="mono-xs font-black text-primary tracking-widest uppercase italic">Node_Active</span>
            </div>
          </header>
          <div class="bg-black/60 p-8 min-h-[700px] relative">
            <network-map></network-map>
          </div>
        </div>
      </div>
    </Layout>
  );
};
