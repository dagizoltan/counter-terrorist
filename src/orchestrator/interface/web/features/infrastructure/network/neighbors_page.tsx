import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Neighbor Networks Page
 * Ambient signals, WiFi APs, and Bluetooth discovery.
 */
export const NeighborNetworksPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout nonce={props.nonce} title="Neighbor Signals // Environmental Intelligence" islandPaths={[
      '/components/islands/EnvironmentalSignals.js'
    ]} csrfToken={props.csrfToken}>
      
      <header class="flex justify-between items-start mb-16 pt-8 animate-in fade-in slide-in-from-top duration-700">
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-3">
            <div class="w-1.5 h-6 bg-warning rounded-full shadow-[0_0_15px_var(--warning)]"></div>
            <h1 class="text-4xl font-black italic tracking-tighter uppercase text-white">Neighbor_Networks</h1>
          </div>
          <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.5em] ml-5">Environmental_Intelligence_Grid</span>
        </div>
        <div class="flex flex-col items-end gap-2">
           <div class="flex items-center gap-2 px-4 py-1.5 bg-warning/5 border border-warning/20 rounded-full">
              <div class="w-1.5 h-1.5 bg-warning rounded-full animate-pulse shadow-[0_0_8px_var(--warning)]"></div>
              <span class="mono-xs font-black text-warning uppercase">Active_Scanning</span>
           </div>
           <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest mt-1">Sensor_Node: Alpha-V</span>
        </div>
      </header>

      {/* TACTICAL METRIC LAYER */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-16 animate-in fade-in slide-in-from-bottom duration-1000 delay-200">
        {[
          { label: 'Ambient_Nodes', value: '42', unit: 'Detected', color: 'primary' },
          { label: 'Signal_Density', value: '-88', unit: 'dBm (avg)', color: 'warning' },
          { label: 'Auth_Friends', value: '06', unit: 'Verified', color: 'success' },
          { label: 'Deception_Hits', value: '12', unit: 'Simulated', color: 'danger' }
        ].map(card => (
          <div class={`t-panel group hover:border-${card.color}/40 transition-all duration-500 overflow-visible`}>
            <div class="flex justify-between items-start mb-4">
               <span class="mono-xs text-slate-600 font-black uppercase tracking-[0.3em] group-hover:text-white transition-colors">{card.label}</span>
               <div class={`w-2 h-2 rounded-full bg-${card.color} opacity-20 group-hover:opacity-100 group-hover:shadow-[0_0_10px_var(--${card.color})] transition-all`}></div>
            </div>
            <div class="flex items-baseline gap-2">
               <span class="text-5xl font-black italic tabular-nums tracking-tighter text-white">{card.value}</span>
               <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">{card.unit}</span>
            </div>
            {/* Minimal background indicator */}
            <div class={`absolute bottom-0 left-0 w-full h-1 bg-${card.color} opacity-10 group-hover:opacity-30 transition-opacity`}></div>
          </div>
        ))}
      </div>

      {/* SIGNAL MATRIX VIEWPORT */}
      <div class="relative min-h-[600px] animate-in fade-in duration-1000 delay-500">
        <div class="t-panel glass-panel border-t-2 border-primary/20 p-0 overflow-hidden shadow-2xl bg-black/40">
           <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/40">
              <div class="flex items-center gap-6">
                 <div class="p-4 bg-primary/10 border border-primary/20 rounded-2xl text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 7h-9"/><path d="M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></svg>
                 </div>
                 <h3 class="tactical-title text-xl tracking-widest uppercase">Live Signal Matrix</h3>
              </div>
           </header>
           <div class="p-8 bg-black/20">
              <environmental-signals></environmental-signals>
           </div>
        </div>
      </div>
    </Layout>
  );
};
