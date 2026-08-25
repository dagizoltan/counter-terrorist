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

      <div class="grid grid-cols-12 gap-4 mb-4">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-primary/30">
          <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-xl tracking-widest">MESH_TOPOLOGY</h3>
               <p class="eyebrow">Live egress mesh visualization</p>
            </div>
            <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-4 py-2 rounded-full">
               <span class="dot active"></span>
               <span class="eyebrow italic" data-tone="primary">Node_Active</span>
            </div>
          </header>
          <div class="bg-black/60 p-4 min-h-[700px] relative">
            <network-map></network-map>
          </div>
        </div>
      </div>
    </Layout>
  );
};
