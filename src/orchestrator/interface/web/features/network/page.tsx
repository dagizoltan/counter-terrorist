import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const NetworkShieldPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Network Shield" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/FirewallAgent.js',
      '/components/islands/VpnAgent.js',
      '/components/islands/AnonymizerController.js',
      '/components/islands/NetworkMap.js'
    ]} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Network_Shield</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Perimeter Defense // Identity Stealth // Topology Discovery</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">
        {/* DISCOVERY GRID */}
        <div class="glass-panel rounded-xl border border-white/5 p-8">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60">Local_Discovery_Grid</h3>
              <div class="px-2 py-0.5 rounded bg-cyber/10 border border-cyber/30 text-cyber text-[8px] font-black uppercase">Live_Scan</div>
           </div>
           <network-map></network-map>
        </div>

        {/* STEALTH CONTROLS */}
        <div class="glass-panel rounded-xl border border-cyber/10 p-8 border-l-4 border-cyber/20 shadow-[0_0_50px_rgba(0,210,255,0.03)]">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-cyber">Stealth_Anonymizer_Grid</h3>
              <div id="stat-vpn-status" class="text-[9px] font-black text-emerald-500 uppercase tracking-widest italic">ENCRYPTED</div>
           </div>
           <div class="mb-8">
              <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-4">Active_Stealth_Configuration</span>
              <anonymizer-controller></anonymizer-controller>
           </div>
           <div class="space-y-8">
              <div class="flex justify-between items-center">
                 <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identity_Rotations</span>
                 <span id="stat-vpn-rotations" class="text-lg font-black text-white tracking-tight">0 Rotations</span>
              </div>
              <div class="pt-8 border-t border-white/5">
                 <button 
                   onclick="fetch('/api/network/rotate', { method: 'POST' }).then(() => alert('Identity rotation initiated.'))"
                   class="w-full py-4 bg-cyber/10 hover:bg-cyber/20 border border-cyber/20 text-cyber text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all"
                 >
                   Force_Identity_Rotation
                 </button>
              </div>
           </div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
