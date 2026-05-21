import { Layout } from "@interface/components/Layout.tsx";

/**
 * Neighbor Networks Page
 * Ambient signals, WiFi APs, and Bluetooth discovery.
 */
export const NeighborNetworksPage = (props: { status: Record<string, unknown>, csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Neighbor Signals // Environmental Intelligence" islandPaths={[
      '/components/islands/EnvironmentalSignals.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      
      <header class="page-header mb-12">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Neighbor Signals</h1>
          <span class="subtitle">Ambient Signal Intercept & Environmental Intelligence</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="status-pill warning active px-6 py-2 text-[10px]">Scanning...</div>
        </div>
      </header>

      {/* Simplified Metric Row */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
        {[
          { label: 'SENSORS', value: '04' },
          { label: 'NOISE', value: '-92dBm' },
          { label: 'INTERCEPTS', value: '24' },
          { label: 'STABILITY', value: '94%' }
        ].map(card => (
          <div class="t-panel glass-panel py-4 px-6 border-t border-white/5 bg-black/20 group hover:border-warning/30 transition-all">
            <span class="mono-xs text-slate-600 font-black uppercase tracking-[0.2em] mb-2 block group-hover:text-warning transition-colors">{card.label}</span>
            <span class="text-xl font-black text-white italic tabular-nums tracking-widest">{card.value}</span>
          </div>
        ))}
      </div>

      <div class="t-panel glass-panel p-0 border-t-2 border-warning/20 overflow-hidden">
        <header class="p-6 border-b border-white/5 bg-black/40 flex justify-between items-center">
           <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">Environmental_Signal_Matrix</span>
           <div class="flex gap-2">
              <div class="w-1.5 h-1.5 bg-warning rounded-full animate-pulse"></div>
           </div>
        </header>
        <div class="p-8">
          <environmental-signals></environmental-signals>
        </div>
      </div>
    </Layout>
  );
};
