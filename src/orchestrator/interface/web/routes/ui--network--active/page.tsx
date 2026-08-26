import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Active Network Page
 * Focused on Authoritative Mesh Core & Local Infrastructure.
 */
export const ActiveNetworkPage = (props: { status: unknown, csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Active Network // Sovereign Mesh" islandPaths={[
      '/components/islands/NetworkMap.js',
      '/components/islands/ListeningPorts.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Active Network</h1>
          <span class="subtitle">Authoritative Routing Mesh & Local Infrastructure Topology</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-4 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active"></span>
              <span class="eyebrow" data-tone="primary">Network Synchronized</span>
           </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-4 mb-4">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-primary group">
          <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-2xl tracking-widest">Infrastructure Map</h3>
               <p class="eyebrow">Live authoritative node interaction & local asset map</p>
            </div>
            <div class="flex gap-4">
               <button type="button" class="t-btn px-4 py-3 text-[10px] font-black uppercase tracking-widest" data-action="reload">Refresh Discovery</button>
            </div>
          </header>
          <div class="bg-black/60 p-5 min-h-[600px] relative">
            <network-map mode="ACTIVE"></network-map>
          </div>
        </div>
      </div>

      {/* The console could open and close ports from the day it shipped —
          arming a decoy calls allowPort — but nothing reported which ports
          were actually open, so the result of the control was invisible. */}
      <section>
        <div class="t-panel glass-panel">
          <listening-ports role-name={props.userRole}></listening-ports>
        </div>
      </section>
    </Layout>
  );
};
