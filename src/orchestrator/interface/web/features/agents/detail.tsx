import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AgentDetailPage = (props: { agent: { name: string; status: string; details?: any }, csrfToken?: string }) => {
  const { agent } = props;
  const islandPaths = [
    '/features/dashboard/islands/BlockingLog.js', 
    '/features/dashboard/islands/AgentDetail.js'
  ];

  return (
    <Layout title={`Agent: ${agent.name}`} islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div class="mb-12 flex justify-between items-center">
        <div class="flex items-center gap-6">
           <a href="/agents" class="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all text-slate-400 hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
           </a>
           <div>
              <div class="flex items-center gap-3 mb-1">
                 <div class={`w-1.5 h-1.5 rounded-full ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]'} animate-pulse`}></div>
                 <span class="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] italic">Tactical_Agent // {agent.name}</span>
              </div>
              <h1 class="text-5xl font-black tracking-widest uppercase">{agent.name}</h1>
           </div>
        </div>
        <div class="flex gap-4">
           <button 
             onclick={`const csrf=document.querySelector('meta[name="csrf-token"]')?.content;fetch('/api/agents/${agent.name}/restart', { method: 'POST', headers: {'X-CT-Token': csrf} }).then(() => location.reload())`}
             class="bg-white text-black px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-cyber hover:text-white transition-all duration-300 rounded"
           >
             Cycle_Process
           </button>
           <button 
             onclick={`const csrf=document.querySelector('meta[name="csrf-token"]')?.content;fetch('/api/agents/${agent.name}/stop', { method: 'POST', headers: {'X-CT-Token': csrf} }).then(() => location.reload())`}
             class="bg-danger/10 text-danger px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] border border-danger/20 hover:bg-danger hover:text-white transition-all duration-300 rounded"
           >
             Deactivate
           </button>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-4 gap-8 mb-12">
        {/* AGENT STATE */}
        <div class="glass-panel p-8 rounded-xl border-l-2 border-l-cyber">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-6 italic opacity-50">Operational_Status</h3>
           <div class="flex flex-col">
              <span class="text-3xl font-black text-white uppercase tracking-tighter">{agent.status}</span>
              <span id={`agent-health-${agent.name}`} class="text-[10px] font-bold text-emerald-500/80 tracking-widest uppercase mt-2">Checking_Pulse...</span>
           </div>
        </div>

        {/* AGENT PID */}
        <div class="glass-panel p-8 rounded-xl border-l-2 border-l-slate-700">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-6 italic opacity-50">Process_Handle</h3>
           <div class="flex flex-col">
              <span id={`agent-pid-${agent.name}`} class="text-3xl font-mono font-bold text-white uppercase tracking-tighter">...</span>
              <span class="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-2">Mode: Persistent</span>
           </div>
        </div>

        {/* CAPABILITIES */}
        <div class="xl:col-span-2 glass-panel p-8 rounded-xl border-l-2 border-l-slate-700">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-6 italic opacity-50">System_Capabilities</h3>
           <div id={`agent-caps-${agent.name}`} class="flex gap-3 flex-wrap">
              <div class="h-6 w-32 bg-white/5 animate-pulse rounded"></div>
              <div class="h-6 w-24 bg-white/5 animate-pulse rounded"></div>
           </div>
           <div class="mt-6 flex items-center gap-4">
              <span class="text-[10px] font-black text-slate-600 uppercase tracking-widest">Privilege_Level:</span>
              <span id={`agent-priv-${agent.name}`} class="text-[10px] font-black text-cyber uppercase italic">Validating...</span>
           </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* LEFT: MONITORING */}
        <div class="lg:col-span-2 space-y-12">
          <section>
            <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
               <h2 class="text-xs font-black uppercase tracking-[0.4em] text-slate-400 italic">Agent_Specific_Telemetry</h2>
               <div class="flex items-center gap-4">
                  <div class="px-3 py-1 rounded bg-cyber/10 border border-cyber/30 text-cyber text-[8px] font-black tracking-[0.2em] uppercase italic animate-pulse">Live_Interceptor</div>
               </div>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden h-[500px]">
               <blocking-log id={`agent-log-${agent.name}`}></blocking-log>
            </div>
          </section>

          <section id="agent-metrics-container" class="space-y-8">
            {/* Dynamically populated by AgentDetail.js island */}
          </section>
        </div>

        {/* RIGHT: COMMAND & CONTROL */}
        <div class="space-y-12">
          <section class="glass-panel p-8 rounded-xl border border-cyber/10">
             <h2 class="text-[11px] font-black uppercase tracking-[0.3em] text-cyber mb-10 border-b border-cyber/10 pb-4 italic">Command_Interface</h2>
             
             <div class="space-y-10">
                {agent.name === 'vpn' && (
                  <div class="space-y-6">
                    <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Tunnel_Operations</p>
                    <div class="grid grid-cols-2 gap-4">
                       <button onclick={`const csrf=document.querySelector('meta[name="csrf-token"]')?.content;fetch('/api/agents/vpn/connect', { method: 'POST', headers: {'X-CT-Token': csrf, 'Content-Type': 'application/json'}, body: JSON.stringify({interface: 'wg0'}) }).then(r => r.json()).then(d => { if(d.success) location.reload(); else alert('VPN_FAILURE: ' + d.message); })`} class="py-3 bg-white/5 hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/50 text-[9px] font-black uppercase tracking-widest rounded transition-all">Link_Tunnel</button>
                       <button onclick={`const csrf=document.querySelector('meta[name="csrf-token"]')?.content;fetch('/api/agents/vpn/disconnect', { method: 'POST', headers: {'X-CT-Token': csrf} }).then(r => r.json()).then(d => { if(d.success) location.reload(); else alert('VPN_FAILURE: ' + d.message); })`} class="py-3 bg-white/5 hover:bg-danger/20 border border-white/10 hover:border-danger/50 text-[9px] font-black uppercase tracking-widest rounded transition-all">Sever_Link</button>
                    </div>
                    <button class="w-full py-3 bg-white/5 hover:bg-cyber/20 border border-white/10 hover:border-cyber/50 text-[9px] font-black uppercase tracking-widest rounded transition-all">Rotate_Keys</button>
                  </div>
                )}

                {agent.name === 'firewall' && (
                  <div class="space-y-6">
                    <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Perimeter_Control</p>
                    <div class="space-y-4">
                       <input id="block-ip-input" type="text" placeholder="IP_ADDRESS" class="w-full bg-black/40 border border-white/10 text-[10px] font-mono p-3 focus:border-cyber outline-none transition-all" />
                       <div class="grid grid-cols-2 gap-4">
                          <button onclick={`const ip=document.getElementById('block-ip-input').value; const csrf=document.querySelector('meta[name="csrf-token"]')?.content; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'X-CT-Token': csrf, 'Content-Type': 'application/json'}, body: JSON.stringify({ip}) }).then(() => location.reload())`} class="py-3 bg-danger/10 hover:bg-danger/20 border border-danger/20 text-danger text-[9px] font-black uppercase tracking-widest rounded transition-all">Block_IP</button>
                          <button class="py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded transition-all">Unblock</button>
                       </div>
                    </div>
                    <button class="w-full py-3 bg-white/5 hover:bg-warning/20 border border-white/10 hover:border-warning/50 text-[9px] font-black uppercase tracking-widest rounded transition-all">Flush_All_Rules</button>
                  </div>
                )}

                {agent.name === 'ebpf' && (
                  <div class="space-y-6">
                    <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Kernel_LSM_Enforcement</p>
                    <div class="space-y-4">
                       <div class="flex items-center justify-between p-3 bg-black/20 border border-white/5 rounded">
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Process_Camouflage</span>
                          <div class="w-8 h-4 bg-emerald-500 rounded-full flex items-center px-1"><div class="w-3 h-3 bg-white rounded-full ml-auto"></div></div>
                       </div>
                       <div class="flex items-center justify-between p-3 bg-black/20 border border-white/5 rounded opacity-50">
                          <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">LSM_Strict_Mode</span>
                          <div class="w-8 h-4 bg-white/10 rounded-full flex items-center px-1"><div class="w-3 h-3 bg-white/20 rounded-full"></div></div>
                       </div>
                    </div>
                    <button class="w-full py-3 bg-white/5 hover:bg-cyber/20 border border-white/10 hover:border-cyber/50 text-[9px] font-black uppercase tracking-widest rounded transition-all">Forensic_Memory_Sweep</button>
                  </div>
                )}

                {agent.name === 'scanner' && (
                  <div class="space-y-6">
                    <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Scan_Operations</p>
                    <div class="space-y-4">
                       <input id="scan-path-input" type="text" placeholder="SCAN_PATH (default: /)" class="w-full bg-black/40 border border-white/10 text-[10px] font-mono p-3 focus:border-cyber outline-none transition-all" />
                       <button onclick={`const path=document.getElementById('scan-path-input').value; const csrf=document.querySelector('meta[name="csrf-token"]')?.content; fetch('/api/agents/scanner/scan', { method: 'POST', headers: {'X-CT-Token': csrf, 'Content-Type': 'application/json'}, body: JSON.stringify({path}) }).then(r => r.json()).then(d => { if(d.success) alert('SCAN_COMPLETE: No threats found.'); else alert('SCAN_ALERT: ' + d.message); })`} class="w-full py-3 bg-cyber/10 hover:bg-cyber/20 border border-cyber/20 text-cyber text-[9px] font-black uppercase tracking-widest rounded transition-all">Execute_Deep_Scan</button>
                    </div>
                    <button class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded transition-all">Update_Definitions</button>
                  </div>
                )}
                <div class="space-y-6 pt-6 border-t border-white/5">
                   <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Global_Directives</p>
                   <button class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded transition-all italic">Refresh_Identity_Verification</button>
                   <button class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded transition-all italic">Export_Agent_Audit</button>
                </div>
             </div>
          </section>

          <section class="glass-panel p-8 rounded-xl border border-white/5">
             <h2 class="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 mb-8 border-b border-white/5 pb-4 italic">Security_Posture</h2>
             <div class="space-y-4">
                <div class="p-4 bg-black/40 rounded-lg border border-white/5">
                   <div class="flex justify-between items-center mb-1">
                      <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Integrity_Hash</span>
                      <span class="text-[10px] font-mono text-white italic">MATCHED</span>
                   </div>
                   <div class="h-0.5 bg-emerald-500/30 w-full"></div>
                </div>
                <div class="p-4 bg-black/40 rounded-lg border border-white/5">
                   <div class="flex justify-between items-center mb-1">
                      <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Audit_Stability</span>
                      <span class="text-[10px] font-mono text-emerald-400">99%</span>
                   </div>
                </div>
             </div>
          </section>
        </div>
      </div>
      <agent-detail data-agent={agent.name}></agent-detail>
    </Layout>
  );
};
