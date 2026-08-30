import { Layout } from "@interface/components/Layout.tsx";
import { Eyebrow } from "@interface/components/Tactical.tsx";

/**
 * Global Threat Map Page
 * High-fidelity spatial awareness for ingress neutralization.
 * Implements 'LibreMap' style autonomous visualization.
 */
export const ThreatMapPage = (props: { status: any, csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Global Threat Map // Spatial awareness" islandPaths={[
      '/components/islands/ThreatMap.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      {/* 01_Page_Header */}
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Global Threat Map</h1>
          <span class="subtitle">Real-time spatial visualization of adversarial infrastructure</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-4 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active"></span>
              <span class="eyebrow" data-tone="primary">Sovereign Resolution Active</span>
           </div>
        </div>
      </header>

      {/* 02_Map_Theater
          The panel takes its height from the map's own aspect ratio. The HUD
          used to float over the plot at top-left and bottom-right; once the
          panel stopped being a fixed 750px box those cards sat on top of the
          geography (the vectoring card covered Australia) and duplicated the
          legend the island already renders. They read as a footer strip now,
          and the map surface carries only its own legend and count. */}
      <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 bg-black/40 overflow-hidden shadow-2xl mb-4 animate-in zoom-in-95 duration-1000">
         <threat-map role-name={props.userRole}></threat-map>

         <footer class="map-hud">
            <div class="map-hud__group">
               <Eyebrow tick>Detection Radius</Eyebrow>
               <span class="map-hud__value">Global</span>
            </div>
            <p class="map-hud__note">
               <span class="indicator indicator--sm" data-state="crit" data-pulse="" aria-hidden="true"></span>
               Ingress IPs resolve against a local GeoIP database when one is
               provisioned; otherwise they are shown as region-level estimates.
               No lookups ever leave the node.
            </p>
         </footer>
      </div>

    </Layout>
  );
};
