import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Neighbor Networks Page
 * Ambient signals, WiFi APs, and Bluetooth discovery.
 */
export const NeighborNetworksPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Neighbor Signals // Environmental Intelligence" islandPaths={[
      '/components/islands/EnvironmentalSignals.js'
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
        <div class="col-span-12">
          <environmental-signals></environmental-signals>
        </div>
      </div>
    </Layout>
  );
};
