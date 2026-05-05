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
      
      <header class="page-header mb-10">
        <div class="title-group">
          <div class="flex items-center gap-4 mb-2">
            <div class="w-10 h-0.5 bg-warning rounded-full"></div>
            <span class="mono-xs font-black text-warning uppercase tracking-[0.4em]">Ambient_Signal_Intercept</span>
          </div>
          <h1 class="text-6xl font-black italic tracking-tighter uppercase leading-none text-white">
            Neighbor <span class="text-warning">Signals</span>
          </h1>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex flex-col items-end">
              <span class="mono-xs text-slate-600 font-black uppercase tracking-widest">Op_State</span>
              <span class="text-2xl font-black text-warning italic uppercase">Scanning</span>
           </div>
        </div>
      </header>

      {/* Metric Cards Row */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Active_Sensors', value: '4', theme: 'warning', icon: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' },
          { label: 'Noise_Floor', value: '-92 dBm', theme: 'slate-500', icon: 'M2 10h3l2-7 4 14 2-7h3' },
          { label: 'Intercept_Count', value: '24', theme: 'primary', icon: 'M12 2l-2 2-2-2-2 2-2-2v18h16V2l-2 2-2-2-2 2-2-2z' },
          { label: 'Signal_Stability', value: '94.2%', theme: 'success', icon: 'M22 12h-4l-3 9L9 3l-3 9H2' }
        ].map(card => (
          <div class="t-panel glass-panel p-6 border-t-2 transition-all hover:bg-white/[0.03] group" style={`border-top-color: ${card.theme.startsWith('var') ? card.theme : `var(--${card.theme})`}`}>
            <div class="flex justify-between items-start mb-4">
              <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">{card.label}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-20 group-hover:opacity-100 transition-opacity"><path d={card.icon}/></svg>
            </div>
            <span class="text-3xl font-black text-white italic tracking-tighter uppercase">{card.value}</span>
          </div>
        ))}
      </div>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12">
          <div class="t-panel glass-panel p-8 bg-black/40 border-t-2 border-warning/30">
            <environmental-signals></environmental-signals>
          </div>
        </div>
      </div>
    </Layout>
  );
};
