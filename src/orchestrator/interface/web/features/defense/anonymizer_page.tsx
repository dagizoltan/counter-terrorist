import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const AnonymizerPage = (props: { status: any, csrfToken?: string }) => {
  const vpnStatus = props.status?.vpn || {};
  
  return (
    <Layout title="Identity Anonymizer // Stealth Control" islandPaths={[
      '/components/islands/AnonymizerController.js'
    ]} csrfToken={props.csrfToken}>
      
      <header class="page-header">
        <div class="title-group">
          <div class="flex items-center gap-4 mb-2">
            <div class="w-10 h-0.5 bg-primary"></div>
            <span class="mono-xs font-black text-primary uppercase tracking-[0.4em]">Active_Identity_Camouflage</span>
          </div>
          <h1 class="text-5xl font-black italic tracking-tighter uppercase leading-none text-white">
            Identity <span class="text-primary">Anonymizer</span>
          </h1>
        </div>
      </header>

      {/* Metric Cards Row */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'Tunnel_Protocol', value: vpnStatus.active ? 'WIREGUARD' : 'DISABLED', theme: vpnStatus.active ? 'primary' : 'slate-500' },
          { label: 'Egress_Node', value: vpnStatus.exitNode || 'US-WEST-1', theme: 'primary' },
          { label: 'Identity_Mode', value: vpnStatus.mode || 'TRADITIONAL', theme: 'warning' },
          { label: 'Rotation_Cycle', value: '45m remaining', theme: 'success' }
        ].map(card => (
          <div class="t-panel glass-panel p-6 border-t-2" style={`border-top-color: var(--${card.theme})`}>
            <span class="mono-xs font-black text-slate-500 uppercase tracking-widest mb-4 block">{card.label}</span>
            <span class="text-2xl font-black text-white italic tracking-tight uppercase">{card.value}</span>
          </div>
        ))}
      </div>

      <div class="grid grid-cols-12 gap-10">
        <div class="col-span-12 lg:col-span-4">
          <div class="t-panel glass-panel p-8 bg-black/40 h-full">
            <h3 class="mono-xs font-black text-slate-500 uppercase tracking-widest mb-8">Protocol_Steering</h3>
            <anonymizer-controller></anonymizer-controller>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-8">
          <div class="t-panel glass-panel p-0 bg-black/40 overflow-hidden h-full flex flex-col">
            <header class="p-8 border-b border-white/5 bg-black/40 flex justify-between items-center">
              <span class="mono-xs font-black text-slate-500 uppercase tracking-widest">Active_Camouflage_Telemetry</span>
              <div class="status-pill active px-6 py-2">LIVE_FEED</div>
            </header>
            <div class="flex-grow p-10 relative overflow-hidden flex items-center justify-center min-h-[400px]">
               <div class="absolute inset-0 opacity-10 pointer-events-none">
                  <div class="w-full h-full bg-[radial-gradient(circle_at_center,var(--primary-glow)_0%,transparent_70%)]"></div>
               </div>
               <div class="text-center space-y-6 z-10">
                  <div class="text-8xl font-black text-primary italic tracking-[0.1em] opacity-20">STEALTH</div>
                  <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.5em]">Identity obfuscation engaged and verified</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
