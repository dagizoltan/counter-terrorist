import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

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
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-8 py-4 rounded-full backdrop-blur-xl">
              <span class="dot active"></span>
              <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Sovereign Resolution Active</span>
           </div>
        </div>
      </header>

      {/* 02_Map_Theater */}
      <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 bg-black/40 overflow-hidden shadow-2xl relative min-h-[750px] mb-8 animate-in zoom-in-95 duration-1000">
         <div class="absolute inset-0 z-0">
            <threat-map></threat-map>
         </div>
         
         {/* HUD_OVERLAYS */}
         <div class="absolute top-8 left-8 z-10 pointer-events-none flex flex-col gap-4">
            <div class="bg-black/80 border border-white/10 p-6 rounded-2xl backdrop-blur-xl shadow-2xl">
               <h4 class="mono-xs font-black text-slate-500 uppercase tracking-widest mb-4">Operational_Scope</h4>
               <div class="flex flex-col gap-2">
                  <div class="flex justify-between gap-12">
                     <span class="mono text-[10px] text-slate-600">Active_Nodes:</span>
                     <span class="mono text-[10px] text-white font-black tabular-nums">4,092</span>
                  </div>
                  <div class="flex justify-between gap-12">
                     <span class="mono text-[10px] text-slate-600">Detection_Radius:</span>
                     <span class="mono text-[10px] text-white font-black uppercase">Global</span>
                  </div>
               </div>
            </div>
         </div>

         <div class="absolute bottom-8 right-8 z-10 pointer-events-none">
            <div class="bg-black/90 border border-danger/30 p-8 rounded-2xl backdrop-blur-2xl shadow-[0_0_50px_rgba(var(--danger-rgb),0.1)]">
               <div class="flex items-center gap-4 mb-4">
                  <div class="w-1.5 h-1.5 bg-danger rounded-full animate-pulse"></div>
                  <span class="mono-xs font-black text-danger tracking-widest uppercase">Live Attack Vectoring</span>
               </div>
               <p class="mono text-[9px] text-slate-500 max-w-[200px]">Ingress events are localized using hardened local GeoIP resolution to preserve orchestrator anonymity.</p>
            </div>
         </div>
      </div>

      {/* 03_Regional_Stats */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
         {[
            { region: 'North America', status: 'Optimal', load: '12%', color: 'primary' },
            { region: 'Eurasia', status: 'Warning', load: '64%', color: 'warning' },
            { region: 'Asia Pacific', status: 'Stable', load: '31%', color: 'success' }
         ].map(r => (
            <div class={`t-panel glass-panel p-8 border-l-2 border-${r.color} bg-black/40`}>
               <div class="flex justify-between items-center mb-6">
                  <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">{r.region}</span>
                  <span class={`status-pill ${r.status.toLowerCase()} active !px-4 !py-1 text-[8px]`}>{r.status}</span>
               </div>
               <div class="flex justify-between items-end">
                  <span class="text-4xl font-black text-white italic tabular-nums">{r.load}</span>
                  <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">Ingress_Density</span>
               </div>
            </div>
         ))}
      </div>

    </Layout>
  );
};
