import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AgentDetailPage = (props: { agent: { name: string; status: string; details?: any }, csrfToken?: string }) => {
  const { agent } = props;
  const islandPaths = [
    '/components/islands/BlockingLog.js', 
    '/components/islands/AgentDetail.js',
    '/components/islands/EbpfAgent.js'
  ];

  return (
    <Layout title={`Agent Detail: ${agent.name}`} islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* HEADER: Identity & Actions */}
      <div class="mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-8 border-b border-white/5 pb-12">
        <div class="flex items-center gap-8">
           <a href="/agents" class="w-14 h-14 flex items-center justify-center bg-white/5 hover:bg-cyber/10 border border-white/10 hover:border-cyber/30 rounded-2xl transition-all text-slate-400 hover:text-cyber group">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1 transition-transform"><path d="m15 18-6-6 6-6"/></svg>
           </a>
           <div>
              <div class="flex items-center gap-3 mb-2">
                 <div class={`w-2 h-2 rounded-full ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(34,197,94,0.6)]' : 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]'} animate-pulse`}></div>
                 <span id={`agent-health-label-${agent.name}`} class="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">{agent.status}</span>
              </div>
               <h1 class="text-6xl font-black tracking-tight uppercase leading-none">
                 {agent.name}
                 {agent.name === 'ebpf' && <span id="ebpf-status-dot" class="ml-4 inline-block w-3 h-3 bg-emerald-500 rounded-full"></span>}
               </h1>
               {agent.name === 'ebpf' && <div id="ebpf-status-label" class="text-[10px] font-black text-cyber uppercase tracking-widest mt-2">Kernel Guardian Active</div>}
            </div>
        </div>
        
        <div class="flex items-center gap-4">
           <div class="flex flex-col items-end mr-8">
              <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Process_Runtime</span>
              <span class="text-xl font-mono font-bold text-white tracking-tighter">99.99% UPTIME</span>
           </div>
           <button 
             id={`btn-restart-${agent.name}`}
             class="px-8 py-4 bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-cyber hover:text-white rounded-xl transition-all"
           >
             Cycle_Process
           </button>
           <button 
             id={`btn-stop-${agent.name}`}
             class="px-8 py-4 bg-danger/10 text-danger border border-danger/20 text-[10px] font-black uppercase tracking-widest hover:bg-danger hover:text-white rounded-xl transition-all"
           >
             Deactivate
           </button>
        </div>
      </div>

      {/* OPERATIONAL SUMMARY BAR */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
         {[
           { label: 'Process_ID', value: '...', id: `agent-pid-${agent.name}`, icon: 'PID', color: 'slate-400' },
           { label: 'Security_Level', value: '...', id: `agent-priv-${agent.name}`, icon: 'SEC', color: 'cyber' },
           { label: 'Health_Metric', value: '...', id: `agent-health-${agent.name}`, icon: 'HTH', color: 'emerald-500' },
           { label: 'Capabilities', value: '', id: `agent-caps-${agent.name}`, icon: 'CAP', color: 'slate-400' }
         ].map(stat => (
           <div class="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col">
              <div class="flex justify-between items-start mb-4">
                 <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                 <span class={`text-[8px] font-black text-${stat.color} opacity-50 tracking-tighter`}>{stat.icon}</span>
              </div>
              <span id={stat.id} class={`text-2xl font-black text-white italic tracking-tighter`}>{stat.value}</span>
           </div>
         ))}
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-12 gap-12">
        {/* MAIN TELEMETRY: 8 COLS */}
        <div class="xl:col-span-8 space-y-12">
          <section>
             <div class="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                <div class="flex items-center gap-4">
                   <h2 class="text-xs font-black uppercase tracking-[0.4em] text-slate-400 italic">Agent_Forensic_Stream</h2>
                   <div class="px-2 py-0.5 rounded bg-cyber/10 border border-cyber/30 text-cyber text-[8px] font-black tracking-widest uppercase">Live_Audit</div>
                </div>
             </div>
             <div class="glass-panel rounded-3xl overflow-hidden h-[600px] border border-white/5 shadow-2xl relative">
                 <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40 pointer-events-none"></div>
                 {agent.name === 'ebpf' ? (
                   <div id="ebpf-event-log" class="h-full p-4 overflow-y-auto space-y-2">
                      <p class="text-slate-600 italic text-[10px] uppercase">Awaiting kernel signals...</p>
                   </div>
                 ) : (
                   <blocking-log id={`agent-log-${agent.name}`} class="h-full"></blocking-log>
                 )}
              </div>
          </section>

          <section id="agent-metrics-container" class="space-y-8">
             {/* Hydrated by AgentDetail.js */}
          </section>
        </div>

        {/* COMMAND & CONTROL SIDEBAR: 4 COLS */}
        <div class="xl:col-span-4 space-y-12">
          <section class="glass-panel p-8 rounded-3xl border border-cyber/10 bg-cyber/[0.02] shadow-[0_0_50px_rgba(0,210,255,0.05)]">
             <h2 class="text-[11px] font-black uppercase tracking-[0.3em] text-cyber mb-10 border-b border-cyber/10 pb-6 flex items-center justify-between">
                Command_Interface
                <span class="w-2 h-2 bg-cyber rounded-full animate-ping"></span>
             </h2>

             <div class="space-y-10">
                {agent.name === 'vpn' && (
                  <div class="space-y-6">
                    <div class="p-4 bg-black/40 rounded-2xl border border-white/5">
                       <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Tunnel_Control</p>
                       <div class="grid grid-cols-2 gap-4">
                          <button id="btn-vpn-connect-main" class="py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Link_Tunnel</button>
                          <button id="btn-vpn-disconnect-main" class="py-4 bg-danger/10 hover:bg-danger/20 border border-danger/20 text-danger text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Sever_Link</button>
                       </div>
                    </div>
                    <button class="w-full py-4 bg-white/5 hover:bg-cyber/10 border border-white/10 hover:border-cyber/30 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Rotate_Identity_Keys</button>
                  </div>
                )}

                {agent.name === 'firewall' && (
                  <div class="space-y-6">
                    <div class="p-4 bg-black/40 rounded-2xl border border-white/5">
                       <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Perimeter_Control</p>
                       <div class="space-y-4">
                          <input id="block-ip-input-main" type="text" placeholder="TARGET_IP" class="w-full bg-black/60 border border-white/10 rounded-xl text-[10px] font-mono p-4 focus:border-danger outline-none transition-all text-white" />
                          <div class="grid grid-cols-2 gap-4">
                             <button onclick={`const ip=document.getElementById('block-ip-input-main').value; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ip}) }).then(() => location.reload())`} class="py-4 bg-danger/10 hover:bg-danger/20 border border-danger/20 text-danger text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Execute_Blockade</button>
                             <button onclick={`const ip=document.getElementById('block-ip-input-main').value; fetch('/api/agents/firewall/unblock', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ip}) }).then(() => location.reload())`} class="py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Pardon_IP</button>
                          </div>
                       </div>
                    </div>
                    <button onclick={`if(confirm('CRITICAL: Flush all firewall rules?')) { fetch('/api/agents/firewall/flush', { method: 'POST' }).then(() => location.reload()) }`} class="w-full py-4 bg-white/5 hover:bg-warning/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all italic">Flush_Global_Ruleset</button>
                  </div>
                )}

                {agent.name === 'ebpf' && (
                  <div class="space-y-6">
                    <div class="p-4 bg-black/40 rounded-2xl border border-white/5">
                       <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">LSM_Directives</p>
                       <div class="space-y-3">
                          <button 
                            onclick={`fetch('/api/agents/ebpf/command', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: 'HIDE_PID'}) }).then(r => r.json()).then(d => alert(d.message || 'PID Hiding Active'))`}
                            class="w-full flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all"
                          >
                             <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Process_Camouflage</span>
                             <div class="w-10 h-5 bg-emerald-500 rounded-full flex items-center px-1 shadow-[0_0_10px_rgba(16,185,129,0.4)]"><div class="w-3 h-3 bg-white rounded-full ml-auto"></div></div>
                          </button>
                          <div class="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 opacity-50">
                             <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">Deep_Syscall_Audit</span>
                             <div class="w-10 h-5 bg-cyber rounded-full flex items-center px-1 shadow-[0_0_10px_rgba(14,165,233,0.4)]"><div class="w-3 h-3 bg-white rounded-full ml-auto"></div></div>
                          </div>
                       </div>
                    </div>
                    <div class="p-4 bg-black/40 rounded-2xl border border-white/5">
                        <p class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Traffic_Shaping</p>
                        <div class="space-y-4">
                           <input id="ebpf-ban-ip" type="text" placeholder="TARGET_IP" class="w-full bg-black/60 border border-white/10 rounded-xl text-[10px] font-mono p-4 focus:border-cyber outline-none transition-all text-white" />
                           <button 
                             onclick={`const ip=document.getElementById('ebpf-ban-ip').value; fetch('/api/agents/ebpf/command', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: 'SHADOW_BAN', ip}) }).then(r => r.json()).then(d => alert(d.message || 'Shadow Ban Engaged'))`}
                             class="w-full py-4 bg-cyber/10 hover:bg-cyber/20 border border-cyber/20 text-cyber text-[9px] font-black uppercase tracking-widest rounded-xl transition-all"
                           >
                             Execute_Shadow_Ban
                           </button>
                        </div>
                    </div>
                    <button class="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Initiate_Forensic_Dump</button>
                  </div>
                )}

                <div class="space-y-3 pt-10 border-t border-white/5">
                   <button class="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Export_Compliance_Report</button>
                   <button class="w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all">Verification_Challenge</button>
                </div>
             </div>
          </section>

          <section class="glass-panel p-8 rounded-3xl border border-white/5 bg-black/40">
             <h2 class="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400 mb-8 border-b border-white/5 pb-4">Agent_Manifest</h2>
             <div id={`agent-caps-${agent.name}`} class="flex gap-2 flex-wrap mb-10">
                <div class="h-6 w-24 bg-white/5 animate-pulse rounded-full"></div>
                <div class="h-6 w-24 bg-white/5 animate-pulse rounded-full"></div>
             </div>
             
             <div class="space-y-6">
                <div class="flex justify-between items-center">
                   <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Integrity_Hash</span>
                   <span class="text-[10px] font-mono text-emerald-500 font-bold italic">VERIFIED</span>
                </div>
                <div class="flex justify-between items-center">
                   <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Audit_Stability</span>
                   <span class="text-[10px] font-mono text-white">99.99%</span>
                </div>
             </div>
          </section>
        </div>
      </div>
      <agent-detail data-agent={agent.name}></agent-detail>
    </Layout>
  );
};
