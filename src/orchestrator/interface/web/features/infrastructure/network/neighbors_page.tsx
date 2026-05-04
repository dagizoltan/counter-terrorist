import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Neighbor Networks Page
 * Ambient signals, WiFi APs, and Bluetooth discovery.
 */
export const NeighborNetworksPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Neighbor Signals // Environmental Intelligence" islandPaths={[
      '/components/islands/NetworkMap.js'
    ]} csrfToken={props.csrfToken}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Neighbor Signals</h1>
          <span class="subtitle">Ambient Wireless Intelligence & Environmental Vector Analysis</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-warning/10 border border-warning/30 px-8 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active" style="background: var(--warning)"></span>
              <span class="mono-xs font-black text-warning tracking-[0.4em] uppercase">Scanning Airwaves</span>
           </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-warning/30 group">
          <header class="p-8 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-2xl tracking-widest">Environmental Spectrum</h3>
               <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Live capture of non-sovereign ambient signals</p>
            </div>
            <div class="flex gap-4">
               <button class="t-btn px-6 py-3 text-[10px] font-black uppercase tracking-widest" onclick="location.reload()">Re-scan Spectrum</button>
            </div>
          </header>
          <div class="bg-black/60 p-12 min-h-[600px] relative">
            <network-map mode="NEIGHBORS"></network-map>
          </div>
        </div>
      </div>
    </Layout>
  );
};
