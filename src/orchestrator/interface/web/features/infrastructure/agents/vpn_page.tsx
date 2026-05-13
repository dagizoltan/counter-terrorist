import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * VPN Agent Page
 * Identity stealth, multi-tier rotation, and egress anonymization.
 */
export const VpnPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout nonce={props.nonce} title="VPN Agent // Identity Stealth" islandPaths={[
      '/components/islands/AnonymizerController.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>VPN Agent</h1>
          <span class="subtitle">Egress Anonymization & Identity Masking // Status: Operational</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 lg:col-span-4">
           <div class="t-panel glass-panel stat-card border-t-2 border-primary group">
            <div class="flex justify-between items-start mb-8">
              <span class="label text-slate-400 font-black tracking-widest">STEALTH CONFIGURATION</span>
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
                  <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-xl">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div class="flex flex-col gap-2">
                     <h3 class="tactical-title text-2xl tracking-widest">TUNNEL TELEMETRY</h3>
                     <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Real-time exit node performance and latency</p>
                  </div>
                </div>
                <div class="flex items-center gap-4">
                   <div class="status-pill active px-8 py-3 font-black tracking-widest">ANONYMOUS</div>
                </div>
             </header>

             <div class="p-8 bg-black/20 min-h-[400px]">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div class="p-6 bg-black/40 border border-white/5 rounded-2xl">
                      <span class="mono-xs text-slate-600 font-black uppercase tracking-widest block mb-4">CURRENT EXIT NODE</span>
                      <div class="text-2xl font-black text-white italic tracking-tighter">Sweden [193.180.164.21]</div>
                   </div>
                   <div class="p-6 bg-black/40 border border-white/5 rounded-2xl">
                      <span class="mono-xs text-slate-600 font-black uppercase tracking-widest block mb-4">TUNNEL LATENCY</span>
                      <div class="text-2xl font-black text-success italic tracking-tighter">42ms</div>
                   </div>
                </div>
                
                <div class="mt-8 p-8 border border-white/5 rounded-2xl bg-black/60 font-mono text-[11px] text-slate-400 space-y-2">
                   <div class="text-primary opacity-50">[INFO] Authenticating with VPNGATE directory...</div>
                   <div class="text-primary opacity-50">[INFO] Selected Sweden node for high-bandwidth persistence.</div>
                   <div class="text-success">[OK] OpenVPN Tunnel established successfully.</div>
                   <div class="text-slate-600">[METRIC] Throughput: 12.4 Mbps // MTU: 1500</div>
                </div>
             </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
