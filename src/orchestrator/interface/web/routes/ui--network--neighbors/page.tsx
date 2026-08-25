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
      
      <header class="page-header mb-5">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Neighbor Signals</h1>
          <span class="subtitle">Ambient Signal Intercept & Environmental Intelligence</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="status-pill warning active">Scanning...</div>
        </div>
      </header>

      {/* Simplified Metric Row */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'SENSORS', value: '04' },
          { label: 'NOISE', value: '-92dBm' },
          { label: 'INTERCEPTS', value: '24' },
          { label: 'STABILITY', value: '94%' }
        ].map(card => (
          <div class="t-panel glass-panel py-4 px-4 border-t border-white/5 bg-black/20 group hover:border-warning/30 transition-all">
            <span class="eyebrow mb-2 block group-hover:text-warning transition-colors">{card.label}</span>
            <span class="text-xl font-black text-white tabular-nums tracking-widest">{card.value}</span>
          </div>
        ))}
      </div>

      <div class="t-panel glass-panel p-0 border-t-2 border-warning/20 overflow-hidden">
        <header class="p-4 border-b border-white/5 bg-black/40 flex justify-between items-center">
           <span class="eyebrow">Environmental_Signal_Matrix</span>
           <div class="flex gap-2">
              <div class="indicator indicator--sm" data-state="warn" data-pulse="" aria-hidden="true"></div>
           </div>
        </header>
        <div class="p-4">
          <environmental-signals></environmental-signals>
        </div>
      </div>
    </Layout>
  );
};
