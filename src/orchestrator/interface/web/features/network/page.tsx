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
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          NETWORK_SHIELD
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Perimeter Defense // Identity Stealth // Topology Discovery</p>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_TOPOLOGY_DISCOVERY
        </h2>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* DISCOVERY GRID */}
          <div class="glass-panel rounded-3xl border border-white/5 p-10">
             <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-white/5 rounded-lg text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                  </div>
                  <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/80">Local_Discovery_Grid</h3>
                </div>
                <div class="px-3 py-1 rounded-full bg-cyber/10 border border-cyber/30 text-cyber text-[8px] font-black uppercase animate-pulse">Live_Scan</div>
             </div>
             <network-map></network-map>
          </div>

          {/* STEALTH CONTROLS */}
          <div class="glass-panel rounded-3xl border border-cyber/10 p-10 border-l-4 border-cyber shadow-[0_0_50px_rgba(0,210,255,0.03)]">
             <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                <div class="flex items-center gap-3">
                   <div class="p-2 bg-cyber/10 rounded-lg text-cyber">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                   </div>
                   <h3 class="text-xs font-black uppercase tracking-[0.2em] text-cyber">Stealth_Anonymizer_Grid</h3>
                </div>
                <div id="stat-vpn-status" class="text-[9px] font-black text-emerald-500 uppercase tracking-widest italic">ENCRYPTED</div>
             </div>
             <div class="mb-10">
                <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-6">Active_Stealth_Configuration</span>
                <anonymizer-controller></anonymizer-controller>
             </div>
             <div class="space-y-10">
                <div class="flex justify-between items-center">
                   <span class="text-[11px] font-black text-slate-400 uppercase tracking-widest">Identity_Rotations</span>
                   <span id="stat-vpn-rotations" class="text-2xl font-black text-white tracking-tight">0 Rotations</span>
                </div>
                <div class="pt-8 border-t border-white/5">
                   <button 
                     onclick="const t=document.querySelector('meta[name=\'csrf-token\']').content; fetch('/api/network/rotate', { method: 'POST', headers: {'X-CT-Token': t} }).then(() => alert('Identity rotation initiated.'))"
                     class="w-full py-4 bg-cyber text-[10px] font-black uppercase tracking-[0.3em] rounded-xl transition-all hover:bg-cyber/80 shadow-[0_10px_20px_-10px_rgba(14,165,233,0.5)]"
                   >
                     Force_Identity_Rotation
                   </button>
                </div>
             </div>
          </div>
        </div>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          02_PERIMETER_ENFORCEMENT
        </h2>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          {/* FIREWALL CONTROLS */}
          <div class="lg:col-span-2 glass-panel rounded-3xl border border-white/5 p-10">
             <div class="flex justify-between items-center mb-10 pb-4 border-b border-white/5">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-white/5 rounded-lg text-slate-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </div>
                  <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/80">Enforcement_Buffer</h3>
                </div>
                <div class="flex items-center gap-4">
                   <span id="fw-pid" class="text-[10px] font-mono text-slate-500">PID_N/A</span>
                   <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                </div>
             </div>
             <div id="fw-blocked-list" class="space-y-3 mb-10 min-h-[120px]">
                <p class="text-slate-500 text-[10px] uppercase font-black italic">Querying firewall state...</p>
             </div>
             <div class="bg-black/40 border border-white/5 p-8 rounded-2xl relative overflow-hidden">
                <div class="absolute top-0 right-0 p-6 opacity-5">
                   <svg class="w-20 h-20 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6">Manual_Block_Instruction</h4>
                <div class="flex flex-col sm:flex-row gap-4 relative z-10">
                   <input id="fw-block-input" type="text" placeholder="TARGET_IP_ADDR" class="flex-grow bg-obsidian/60 border border-white/10 rounded-xl px-6 py-4 text-[12px] font-mono text-white outline-none focus:border-red-500/50 transition-all placeholder:text-slate-700" />
                   <button 
                     onclick="const ip=document.getElementById('fw-block-input').value; const t=document.querySelector('meta[name=\'csrf-token\']').content; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json', 'X-CT-Token': t}, body: JSON.stringify({ip}) }).then(() => location.reload())"
                     class="px-10 py-4 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger text-[10px] font-black uppercase tracking-[0.3em] rounded-xl transition-all shadow-[0_10px_20px_-10px_rgba(239,68,68,0.3)]"
                   >
                     Enforce_Block
                   </button>
                </div>
             </div>
          </div>

          {/* TRAFFIC LOGS */}
          <div class="glass-panel rounded-3xl border border-white/5 p-10 flex flex-col">
             <div class="flex items-center gap-4 mb-10 pb-4 border-b border-white/5">
                <div class="p-2 bg-white/5 rounded-lg text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                </div>
                <h3 class="text-xs font-black uppercase tracking-[0.2em] text-white/80">Live_Traffic</h3>
             </div>
             <div id="fw-traffic-list" class="flex-grow space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                <p class="text-slate-500 text-[10px] font-black uppercase italic opacity-50">Awaiting packet stream...</p>
             </div>
          </div>
        </div>
      </div>

      <firewall-agent></firewall-agent>
      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
