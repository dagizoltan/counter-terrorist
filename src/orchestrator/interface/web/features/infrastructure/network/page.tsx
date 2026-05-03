import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Network Shield Page
 * Hardened perimeter defense and identity anonymization portal.
 */
export const NetworkShieldPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="Network Shield // Perimeter Defense" islandPaths={[
      '/components/islands/MetricsHydrator.js',
      '/components/islands/FirewallAgent.js',
      '/components/islands/VpnAgent.js',
      '/components/islands/AnonymizerController.js',
      '/components/islands/NetworkMap.js'
    ]} csrfToken={props.csrfToken}>
      
      {/* 01_Header_Section */}
      <header class="flex justify-between items-end mb-16 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-primary rounded shadow-primary"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Network_Shield</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-success"></span>
                <span class="mono-xs font-black text-success tracking-widest uppercase">Perimeter_Reinforced</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">Identity: Stealth_Engaged</div>
            </div>
          </div>
        </div>
        <div class="flex gap-4 mb-2">
          <button class="t-btn group px-6 py-3" onclick="location.reload()">
             <span class="relative z-10">Refresh_Shield_Grid</span>
          </button>
        </div>
      </header>

      {/* 02_Tactical_Grid */}
      <div class="grid grid-cols-12 gap-8 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        {/* Topology Discovery */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-800">
          <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
            <div class="flex items-center gap-4">
              <div class="p-3 bg-primary/10 border border-primary/20 text-primary rounded shadow-primary">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              </div>
              <div class="flex flex-col gap-1">
                 <h3 class="tactical-title text-lg uppercase tracking-widest">TOPOLOGY_DISCOVERY</h3>
                 <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Live egress mesh visualization</p>
              </div>
            </div>
            <div class="flex items-center gap-3 bg-black/40 px-4 py-2 rounded border border-white/5">
               <span class="dot active shadow-primary animate-pulse"></span>
               <span class="mono-xs font-black text-primary tracking-widest uppercase italic">Live_Active_Sweep</span>
            </div>
          </header>
          <div class="bg-black/40 p-8 min-h-[480px] relative group">
            <network-map></network-map>
            <div class="absolute bottom-6 right-6 opacity-30 group-hover:opacity-100 transition-opacity pointer-events-none">
               <span class="mono-xs font-black text-slate-700 uppercase tracking-[0.3em]">Grid_Coordination: Active</span>
            </div>
          </div>
        </div>

        {/* Identity Stealth & Controls */}
        <div class="col-span-12 lg:col-span-4 flex flex-col gap-8">
          <div class="t-panel glass-panel border-t-4 border-primary p-10">
            <div class="flex justify-between items-center mb-10 pb-4 border-b border-white/5">
              <div class="flex flex-col gap-1">
                 <h3 class="tactical-title text-sm uppercase tracking-widest">IDENTITY_STEALTH</h3>
                 <p class="mono-xs text-slate-500 font-bold uppercase">Anonymization Core</p>
              </div>
              <div id="stat-vpn-status" class="status-pill active py-1 px-4 shadow-success/20">ENCRYPTED</div>
            </div>
            
            <div class="bg-black/40 rounded-xl p-6 border border-white/5 mb-10">
               <anonymizer-controller></anonymizer-controller>
            </div>
            
            <div class="space-y-8 pt-8 border-t border-white/5">
              <div class="flex justify-between items-center px-4">
                <div class="flex flex-col">
                   <span class="metric-tag">Node_Rotations</span>
                   <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Session_Life</span>
                </div>
                <span id="stat-vpn-rotations" class="text-5xl font-black text-white tabular-nums tracking-tighter">00</span>
              </div>
              <button 
                onclick="const t=document.querySelector('meta[name=\'csrf-token\']')?.content; fetch('/api/network/rotate', { method: 'POST', headers: {'X-CT-Token': t} })"
                class="t-btn w-full py-4 text-xs font-black uppercase tracking-widest shadow-primary/10"
              >
                Force_Protocol_Rotation
              </button>
            </div>
          </div>

          <div class="t-panel glass-panel p-8 transition-all hover:bg-white/[0.02]">
            <h3 class="tactical-title text-sm mb-6 uppercase tracking-widest">NODE_REPUTATION_SCORE</h3>
            <div class="flex items-center gap-6 mb-6">
               <div class="flex-grow h-2 bg-white/5 rounded-full overflow-hidden shadow-inner">
                  <div class="h-full bg-success shadow-success transition-all duration-1000" style="width:98%"></div>
               </div>
               <span class="text-3xl font-black text-success tabular-nums tracking-tighter">9.8</span>
            </div>
            <div class="p-4 bg-black/40 rounded border border-white/5">
               <p class="mono-xs text-slate-600 font-bold uppercase leading-relaxed italic">
                 "Current node exit reputation is optimal. No behavioral flagging detected in global threat pools."
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* 03_Perimeter_Enforcement */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">03_PERIMETER_ENFORCEMENT_TERMINAL</h2>
        <div class="t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-800">
           <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
              <div class="flex items-center gap-4">
                <div class="p-3 bg-danger/10 border border-danger/20 text-danger rounded shadow-danger">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div class="flex flex-col gap-1">
                   <h3 class="tactical-title text-lg uppercase tracking-widest">PERIMETER_ENFORCEMENT_STREAM</h3>
                   <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Real-time packet filtration & ingress blocklist</p>
                </div>
              </div>
              <div class="flex items-center gap-6">
                 <span id="fw-pid" class="mono-xs font-black text-slate-700 uppercase tracking-[0.2em]">PID: RECOVERING...</span>
                 <div class="status-pill error pulse px-4 py-2">ACTIVE_DEFENSE_ENGAGED</div>
              </div>
           </header>

           <div class="grid grid-cols-12">
              <div class="col-span-12 lg:col-span-8 p-8 border-r border-white/5">
                 <div id="fw-traffic-list" class="bg-black/80 rounded-xl p-8 border border-white/5 h-[500px] overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed space-y-3">
                    <div class="flex items-center gap-4 text-slate-600 animate-pulse uppercase tracking-widest">
                       <span class="w-2 h-2 bg-slate-800 rounded-full"></span>
                       Awaiting_Packet_Stream_Verification...
                    </div>
                 </div>
              </div>
              <div class="col-span-12 lg:col-span-4 p-8 flex flex-col gap-8 bg-black/20">
                 <div class="space-y-6">
                    <h3 class="tactical-title text-xs uppercase tracking-widest">MANUAL_ENFORCEMENT_OVERRIDE</h3>
                    <div class="relative group">
                       <input id="fw-block-input" type="text" class="t-input w-full pl-12" placeholder="TARGET_IPV4_ADDR" />
                       <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-700 group-hover:text-primary transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                       </div>
                    </div>
                    <button 
                      onclick="const ip=document.getElementById('fw-block-input').value; const t=document.querySelector('meta[name=\'csrf-token\']')?.content; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json', 'X-CT-Token': t}, body: JSON.stringify({ip}) })"
                      class="t-btn danger w-full py-4 font-black uppercase tracking-widest shadow-danger/10"
                    >
                      Enforce_Immediate_Block
                    </button>
                 </div>

                 <div class="flex-grow flex flex-col">
                    <div class="flex justify-between items-center mb-6">
                       <h3 class="tactical-title text-xs uppercase tracking-widest">ACTIVE_BLACKLIST_MANIFEST</h3>
                       <span class="mono-xs text-slate-700 font-bold">SHA-256 Verified</span>
                    </div>
                    <div id="fw-blocked-list" class="flex-grow bg-black/40 border border-white/5 rounded-xl p-6 overflow-y-auto max-h-[220px] custom-scrollbar space-y-2">
                       {/* Blocked IP entries will be injected here */}
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      <firewall-agent></firewall-agent>
      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
