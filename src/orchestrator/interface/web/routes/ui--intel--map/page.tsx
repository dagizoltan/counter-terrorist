import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { Eyebrow, StatusPill, TacticalPanel } from "@interface/components/Tactical.tsx";

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

      {/* 02_Map_Theater */}
      <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 bg-black/40 overflow-hidden shadow-2xl relative min-h-[750px] mb-4 animate-in zoom-in-95 duration-1000">
         <div class="absolute inset-0 z-0">
            <threat-map></threat-map>
         </div>
         
         {/* HUD_OVERLAYS */}
         <div class="absolute top-8 left-8 z-10 pointer-events-none flex flex-col gap-4">
            <div class="bg-black/80 border border-white/10 p-4 rounded-lg backdrop-blur-xl shadow-2xl">
               <h4 class="eyebrow mb-4">Operational_Scope</h4>
               <div class="flex flex-col gap-2">
                  <div class="flex justify-between gap-4">
                     <span class="mono text-[10px] text-slate-600">Active_Nodes:</span>
                     <span class="mono text-[10px] text-white font-black tabular-nums">4,092</span>
                  </div>
                  <div class="flex justify-between gap-4">
                     <span class="mono text-[10px] text-slate-600">Detection_Radius:</span>
                     <span class="eyebrow" data-tone="strong">Global</span>
                  </div>
               </div>
            </div>
         </div>

         <div class="absolute bottom-8 right-8 z-10 pointer-events-none">
            <div class="bg-black/90 border border-danger/30 p-4 rounded-lg backdrop-blur-2xl shadow-[0_0_50px_rgba(var(--danger-rgb),0.1)]">
               <div class="flex items-center gap-4 mb-4">
                  <div class="indicator indicator--sm" data-state="crit" data-pulse="" aria-hidden="true"></div>
                  <span class="eyebrow" data-tone="danger">Live Attack Vectoring</span>
               </div>
               <p class="mono text-[9px] text-slate-500 max-w-[200px]">Ingress events are localized using hardened local GeoIP resolution to preserve orchestrator anonymity.</p>
            </div>
         </div>
      </div>

      {/* 03_Regional_Stats */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
         {[
            { region: 'North America', status: 'Optimal', state: 'ok', load: '12%' },
            { region: 'Eurasia', status: 'Warning', state: 'warn', load: '64%' },
            { region: 'Asia Pacific', status: 'Stable', state: 'ok', load: '31%' }
         ].map(r => (
            <TacticalPanel accent={r.state}>
               <div class="flex justify-between items-center mb-4">
                  <Eyebrow>{r.region}</Eyebrow>
                  <StatusPill status={r.state} label={r.status} dot />
               </div>
               <div class="flex justify-between items-end">
                  <span class="metric__value num">{r.load}</span>
                  <Eyebrow>Ingress Density</Eyebrow>
               </div>
            </TacticalPanel>
         ))}
      </div>

    </Layout>
  );
};
