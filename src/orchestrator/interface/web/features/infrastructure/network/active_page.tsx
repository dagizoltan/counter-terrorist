import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Active Network Page
 * Focused on Authoritative Mesh Core & Local Infrastructure.
 */
export const ActiveNetworkPage = (props: { status: any, csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Active Network // Sovereign Mesh" islandPaths={[
      '/components/islands/NetworkMap.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Active Network</h1>
          <span class="subtitle">Authoritative Routing Mesh & Local Infrastructure Topology</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-8 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active"></span>
              <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Network Synchronized</span>
           </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-primary group">
          <header class="p-8 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-2xl tracking-widest">Infrastructure Map</h3>
               <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Live authoritative node interaction & local asset map</p>
            </div>
            <div class="flex gap-4">
               <button class="t-btn px-6 py-3 text-[10px] font-black uppercase tracking-widest" onclick="location.reload()">Refresh Discovery</button>
            </div>
          </header>
          <div class="bg-black/60 p-12 min-h-[600px] relative">
            <network-map mode="ACTIVE"></network-map>
          </div>
        </div>
      </div>
    </Layout>
  );
};
