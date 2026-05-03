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
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Network Shield</h1>
          <span class="subtitle">Perimeter Defense & Stealth Portal // Identity: Encrypted</span>
        </div>
        <div class="flex gap-4">
          <button class="t-btn px-8 py-4 text-[10px] font-black group" onclick="location.reload()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-2 group-hover:rotate-180 transition-transform duration-700"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            Refresh_Grid_State
          </button>
        </div>
      </header>

      {/* 02_Tactical_Grid */}
      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        {/* Topology Discovery */}
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-0 border-t-2 border-primary/30 group">
          <header class="p-8 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex flex-col gap-2">
               <h3 class="tactical-title text-xl tracking-widest group-hover:text-primary transition-colors">TOPOLOGY_DISCOVERY</h3>
               <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Live egress mesh visualization</p>
            </div>
            <div class="flex items-center gap-4 bg-primary/10 border border-primary/30 px-6 py-2 rounded-full shadow-primary/20">
               <span class="dot active shadow-primary animate-pulse"></span>
               <span class="mono-xs font-black text-primary tracking-widest uppercase italic">Node_Active</span>
            </div>
          </header>
          <div class="bg-black/60 p-12 min-h-[520px] relative">
            <network-map></network-map>
          </div>
        </div>

        {/* Identity Stealth & Controls */}
        <div class="col-span-12 lg:col-span-4 flex flex-col gap-10">
          <div class="t-panel glass-panel stat-card border-t-2 border-primary group">
            <div class="flex justify-between items-start mb-8">
              <span class="label text-slate-400 font-black tracking-widest">IDENTITY_STEALTH</span>
              <div id="stat-vpn-status" class="status-pill active font-black tracking-[0.2em] px-6 py-2 shadow-primary/20">ENCRYPTED</div>
            </div>
            
            <div class="bg-black/60 rounded-2xl p-8 border border-white/10 mb-8 shadow-inner group-hover:border-primary/20 transition-colors">
               <anonymizer-controller></anonymizer-controller>
            </div>
            
            <div class="value-group">
              <span id="stat-vpn-rotations" class="value text-5xl tracking-tighter tabular-nums">00</span>
              <span class="unit text-lg font-black text-slate-600 uppercase ml-4">Rotations</span>
            </div>

            <div class="mt-10 pt-10 border-t border-white/5">
              <button 
                onclick="const t=document.querySelector('meta[name=\'csrf-token\']')?.content; fetch('/api/network/rotate', { method: 'POST', headers: {'X-CT-Token': t} })"
                class="t-btn w-full py-5 text-[10px] font-black uppercase tracking-[0.3em] group/btn"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="mr-3 group-hover/btn:rotate-180 transition-transform duration-700"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                Force_Protocol_Rotation
              </button>
            </div>
          </div>

          <div class="t-panel glass-panel p-10 transition-all hover:bg-white/[0.04] border-t-2 border-success/30 group">
            <h3 class="tactical-title text-sm mb-10 uppercase tracking-[0.3em] text-slate-400 group-hover:text-success transition-colors">NODE_REPUTATION_INDEX</h3>
            <div class="flex items-center gap-8 mb-10">
               <div class="flex-grow h-3 bg-white/5 rounded-full overflow-hidden shadow-inner">
                  <div class="h-full bg-success shadow-success transition-all duration-[2000ms] ease-out" style="width:98%"></div>
               </div>
               <span class="text-4xl font-black text-success tabular-nums tracking-tighter">9.8</span>
            </div>
            <div class="p-6 bg-black/60 rounded-xl border border-white/10 shadow-inner">
               <p class="mono-xs text-slate-500 font-black uppercase leading-loose tracking-widest italic">
                 "Current node exit reputation is optimal. No behavioral flagging detected in global threat pools."
               </p>
            </div>
          </div>
        </div>
      </div>

      {/* 03_Perimeter_Enforcement */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
        <div class="flex items-center gap-6 mb-10 pb-4 border-b border-white/5">
           <div class="w-12 h-1.5 bg-danger rounded-full shadow-danger"></div>
           <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">03_PERIMETER_ENFORCEMENT_TERMINAL</h2>
        </div>
        <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 group">
           <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-8">
                <div class="p-4 bg-danger/10 border border-danger/30 text-danger rounded-xl shadow-danger/20 group-hover:scale-110 transition-transform duration-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div class="flex flex-col gap-2">
                   <h3 class="tactical-title text-2xl tracking-widest">PERIMETER_ENFORCEMENT_STREAM</h3>
                   <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Real-time packet filtration & ingress blocklist</p>
                </div>
              </div>
              <div class="flex items-center gap-8">
                 <div class="px-6 py-3 bg-black/60 border border-white/10 rounded-full shadow-inner">
                    <span id="fw-pid" class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">PID: <span class="text-white">RECOVERING...</span></span>
                 </div>
                 <div class="status-pill error pulse px-8 py-3 font-black tracking-widest shadow-danger/20">ACTIVE_DEFENSE_ENGAGED</div>
              </div>
           </header>

           <div class="grid grid-cols-12">
              <div class="col-span-12 lg:col-span-8 p-12 border-r border-white/5 bg-black/20">
                 <div id="fw-traffic-list" class="bg-black/80 rounded-2xl p-10 border border-white/10 h-[600px] overflow-y-auto custom-scrollbar font-mono text-[12px] leading-relaxed space-y-4 shadow-inner">
                    <div class="flex items-center gap-6 text-slate-600 animate-pulse uppercase tracking-[0.3em]">
                       <span class="w-3 h-3 bg-slate-800 rounded-full"></span>
                       Awaiting_Packet_Stream_Verification...
                    </div>
                 </div>
              </div>
              <div class="col-span-12 lg:col-span-4 p-12 flex flex-col gap-10 bg-black/40 backdrop-blur-sm">
                 <div class="space-y-8">
                    <h3 class="tactical-title text-sm uppercase tracking-[0.3em] text-slate-400">MANUAL_ENFORCEMENT_OVERRIDE</h3>
                    <div class="relative group">
                       <input id="fw-block-input" type="text" class="t-input w-full pl-14 py-5" placeholder="TARGET_IPV4_ADDR" />
                       <div class="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600 group-hover:text-danger transition-colors">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                       </div>
                    </div>
                    <button 
                      onclick="const ip=document.getElementById('fw-block-input').value; const t=document.querySelector('meta[name=\'csrf-token\']')?.content; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json', 'X-CT-Token': t}, body: JSON.stringify({ip}) })"
                      class="t-btn danger w-full py-5 font-black uppercase tracking-[0.4em] shadow-danger/20 group/btn"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="mr-3 group-hover/btn:scale-125 transition-transform"><path d="m15 9-6 6"/><path d="m9 9 6 6"/><circle cx="12" cy="12" r="10"/></svg>
                      Enforce_Immediate_Block
                    </button>
                 </div>

                 <div class="flex-grow flex flex-col">
                    <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                       <h3 class="tactical-title text-sm uppercase tracking-[0.3em] text-slate-400">ACTIVE_BLACKLIST_MANIFEST</h3>
                       <span class="mono-xs text-slate-700 font-black tracking-widest uppercase">SHA-256</span>
                    </div>
                    <div id="fw-blocked-list" class="flex-grow bg-black/60 border border-white/10 rounded-2xl p-8 overflow-y-auto max-h-[300px] custom-scrollbar space-y-3 shadow-inner">
                       {/* Blocked IP entries will be injected here */}
                       <div class="flex items-center justify-center h-full opacity-20">
                          <span class="mono-xs font-black uppercase tracking-[0.5em]">Ledger_Empty</span>
                       </div>
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
