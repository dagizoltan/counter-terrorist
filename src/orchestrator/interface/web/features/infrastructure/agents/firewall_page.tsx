import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Firewall Agent Page
 * Hardened perimeter defense, blocklists, and active containment.
 */
export const FirewallPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout nonce={props.nonce} title="Firewall Agent // Active Enforcement" islandPaths={[
      '/components/islands/FirewallAgent.js',
      '/components/islands/AnonymizerController.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>Firewall_Agent</h1>
          <span class="subtitle">Perimeter Defense & Ingress Containment // Status: Operational</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 lg:col-span-4">
           <div class="t-panel glass-panel stat-card border-t-2 border-primary group">
            <div class="flex justify-between items-start mb-8">
              <span class="label text-slate-400 font-black tracking-widest">IDENTITY_STEALTH</span>
              <div id="stat-vpn-status" class="status-pill active font-black tracking-[0.2em] px-6 py-2">ENCRYPTED</div>
            </div>
            
            <div class="bg-black/60 rounded-2xl p-8 border border-white/10 mb-8">
               <anonymizer-controller></anonymizer-controller>
            </div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-8">
          <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 group">
             <header class="p-6 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
                <div class="flex items-center gap-4">
                  <div class="p-4 bg-danger/10 border border-danger/30 text-danger rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div class="flex flex-col gap-2">
                     <h3 class="tactical-title text-2xl tracking-widest">PERIMETER_ENFORCEMENT</h3>
                     <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Real-time packet filtration & blocklist</p>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                   <div class="status-pill error px-8 py-3 font-black tracking-widest">ACTIVE_DEFENSE</div>
                </div>
             </header>

             <div class="grid grid-cols-12">
                <div class="col-span-12 lg:col-span-7 p-6 border-r border-white/5 bg-black/20">
                   <div id="fw-traffic-list" class="bg-black/80 rounded-2xl p-8 border border-white/10 h-[500px] overflow-y-auto custom-scrollbar font-mono text-[11px] leading-relaxed space-y-3">
                      <div class="flex items-center gap-6 text-slate-600 uppercase tracking-[0.3em]">
                         Awaiting_Packet_Stream...
                      </div>
                   </div>
                </div>
                <div class="col-span-12 lg:col-span-5 p-6 flex flex-col gap-4 bg-black/40 backdrop-blur-sm">
                   <div class="space-y-6">
                      <h3 class="tactical-title text-xs uppercase tracking-[0.3em] text-slate-400">MANUAL_OVERRIDE</h3>
                      <div class="relative group">
                         <input id="fw-block-input" type="text" class="t-input w-full pl-12 py-4" placeholder="TARGET_IPV4" />
                      </div>
                      <button 
                        onclick="const ip=document.getElementById('fw-block-input').value; const t=document.querySelector('meta[name=\'csrf-token\']')?.content; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json', 'X-CT-Token': t}, body: JSON.stringify({ip}) })"
                        class="t-btn danger w-full py-4 font-black uppercase tracking-[0.4em] group/btn"
                      >
                        Enforce_Block
                      </button>
                   </div>

                   <div class="flex-grow flex flex-col">
                      <h3 class="tactical-title text-xs uppercase tracking-[0.3em] text-slate-400 mb-6 pb-2 border-b border-white/5">ACTIVE_BLOCKLIST</h3>
                      <div id="fw-blocked-list" class="flex-grow bg-black/60 border border-white/10 rounded-2xl p-6 overflow-y-auto max-h-[250px] custom-scrollbar space-y-2">
                         <div class="flex items-center justify-center h-full opacity-20">
                            <span class="mono-xs font-black uppercase tracking-[0.5em]">Empty</span>
                         </div>
                      </div>
                   </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      <firewall-agent></firewall-agent>
    </Layout>
  );
};
