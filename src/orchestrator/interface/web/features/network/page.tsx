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
                   onclick="const t=document.querySelector('meta[name=\'csrf-token\']').content; fetch('/api/network/rotate', { method: 'POST', headers: {'X-CT-Token': t} }).then(() => alert('Identity rotation initiated.'))"
                   class="w-full py-4 bg-cyber/10 hover:bg-cyber/20 border border-cyber/20 text-cyber text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all"
                 >
                   Force_Identity_Rotation
                 </button>
              </div>
           </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
        {/* FIREWALL CONTROLS */}
        <div class="lg:col-span-2 glass-panel rounded-xl border border-white/5 p-8">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60">Perimeter_Enforcement_Buffer</h3>
              <div class="flex items-center gap-4">
                 <span id="fw-pid" class="text-[10px] font-mono text-slate-500">PID_N/A</span>
                 <div class="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]"></div>
              </div>
           </div>
           <div id="fw-blocked-list" class="space-y-2 mb-8 min-h-[100px]">
              <p class="text-slate-500 text-[9px] uppercase font-bold">Querying firewall state...</p>
           </div>
           <div class="bg-black/40 border border-white/5 p-6 rounded-lg">
              <h4 class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-4">Manual_Block_Instruction</h4>
              <div class="flex gap-4">
                 <input id="fw-block-input" type="text" placeholder="TARGET_IP_ADDR" class="flex-grow bg-obsidian border border-white/10 rounded px-4 py-2 text-[11px] font-mono text-white outline-none focus:border-red-500/50 transition-all" />
                 <button 
                   onclick="const ip=document.getElementById('fw-block-input').value; const t=document.querySelector('meta[name=\'csrf-token\']').content; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json', 'X-CT-Token': t}, body: JSON.stringify({ip}) }).then(() => location.reload())"
                   class="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 text-[9px] font-black uppercase tracking-widest rounded transition-all"
                 >
                   Enforce_Block
                 </button>
              </div>
           </div>
        </div>

        {/* TRAFFIC LOGS */}
        <div class="glass-panel rounded-xl border border-white/5 p-8">
           <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/60 mb-8 pb-4 border-b border-white/5">Live_Traffic_Signals</h3>
           <div id="fw-traffic-list" class="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
              <p class="text-slate-500 text-[9px] italic">Awaiting packet stream...</p>
           </div>
        </div>
      </div>

      <firewall-agent></firewall-agent>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
