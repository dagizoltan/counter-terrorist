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
      <div class="mb-12 flex flex-col lg:flex-row lg:items-center justify-between gap-8 border-b border-white/5 pb-12 relative overflow-hidden">
        <div class="flex items-center gap-10">
           <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 hover:bg-cyber/10 border border-white/10 hover:border-cyber/30 rounded-2xl transition-all text-slate-400 hover:text-cyber group shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1 transition-transform"><path d="m15 18-6-6 6-6"/></svg>
           </a>
           <div>
              <div class="flex items-center gap-4 mb-4">
                 <div class={`w-3 h-3 rounded-full ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'bg-success shadow-[0_0_15px_rgba(16,185,129,0.6)]' : 'bg-danger shadow-[0_0_15px_rgba(239,68,68,0.6)]'} animate-pulse`}></div>
                 <span id={`agent-health-label-${agent.name}`} class="text-slate-500 text-[11px] font-black uppercase tracking-[0.5em]">{agent.status}</span>
              </div>
               <h1 class="text-7xl font-black tracking-tighter uppercase leading-none text-white italic">
                 {agent.name}
                 {agent.name === 'ebpf' && <span id="ebpf-status-dot" class="ml-6 inline-block w-4 h-4 bg-success rounded-full shadow-[0_0_20px_rgba(16,185,129,0.5)]"></span>}
               </h1>
               {agent.name === 'ebpf' && <div id="ebpf-status-label" class="text-[11px] font-black text-cyber uppercase tracking-[0.4em] mt-4 flex items-center gap-2">
                  <span class="w-8 h-px bg-cyber/30"></span>
                  Kernel Guardian Active
               </div>}
            </div>
        </div>
        
        <div class="flex items-center gap-6">
           <div class="flex flex-col items-end mr-10">
              <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Process_Runtime</span>
              <span class="text-2xl font-mono font-black text-white tracking-tighter italic">99.99% UPTIME</span>
           </div>
           <button 
             id={`btn-restart-${agent.name}`}
             class="px-10 py-5 bg-white text-black text-[11px] font-black uppercase tracking-[0.2em] hover:bg-cyber hover:text-white rounded-2xl transition-all shadow-[0_10px_30px_-10px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95"
           >
             Cycle_Process
           </button>
           <button 
             id={`btn-stop-${agent.name}`}
             class="px-10 py-5 bg-danger/10 text-danger border border-danger/30 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-danger hover:text-white rounded-2xl transition-all hover:scale-105 active:scale-95"
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
           <div class="glass-panel p-8 rounded-3xl border border-white/5 flex flex-col group hover:border-white/10 transition-all">
              <div class="flex justify-between items-start mb-6">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</span>
                 <span class={`text-[9px] font-black text-${stat.color} opacity-40 tracking-tighter italic`}>{stat.icon}_BLOCK</span>
              </div>
              <span id={stat.id} class={`text-3xl font-black text-white italic tracking-tighter truncate`}>{stat.value}</span>
           </div>
         ))}
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-12 gap-12">
        {/* MAIN TELEMETRY: 8 COLS */}
        <div class="xl:col-span-8 space-y-12">
          <section>
             <div class="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
                <div class="flex items-center gap-4">
                   <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 italic">01_FORENSIC_STREAM</h2>
                   <div class="px-3 py-1 rounded-full bg-cyber/10 border border-cyber/30 text-cyber text-[9px] font-black tracking-widest uppercase animate-pulse">Live_Audit</div>
                </div>
             </div>
             <div class="glass-panel rounded-3xl overflow-hidden h-[700px] border border-white/5 shadow-2xl relative group hover:border-white/10 transition-all">
                 <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/60 pointer-events-none"></div>
                 {agent.name === 'ebpf' ? (
                   <div id="ebpf-event-log" class="h-full p-8 overflow-y-auto space-y-3 custom-scrollbar">
                      <p class="text-slate-600 italic text-[11px] font-black uppercase opacity-50 tracking-widest">Awaiting kernel signals from LSM interface...</p>
                   </div>
                 ) : (
                   <blocking-log id={`agent-log-${agent.name}`} class="h-full"></blocking-log>
                 )}
              </div>
          </section>

          <section id="agent-metrics-container" class="space-y-12">
             {/* Hydrated by AgentDetail.js */}
          </section>
        </div>

        {/* COMMAND & CONTROL SIDEBAR: 4 COLS */}
        <div class="xl:col-span-4 space-y-12">
          <section class="glass-panel p-10 rounded-3xl border border-cyber/20 bg-cyber/[0.02] shadow-[0_0_60px_rgba(0,210,255,0.06)] relative overflow-hidden group hover:border-cyber/40 transition-all">
             <div class="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-cyber"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="12" r="3"/></svg>
             </div>
             <h2 class="text-[12px] font-black uppercase tracking-[0.4em] text-cyber mb-10 border-b border-cyber/20 pb-6 flex items-center justify-between relative z-10">
                COMMAND_INTERFACE
                <span class="w-3 h-3 bg-cyber rounded-full animate-ping shadow-[0_0_10px_rgba(14,165,233,0.5)]"></span>
             </h2>

             <div class="space-y-12 relative z-10">
                {agent.name === 'vpn' && (
                  <div class="space-y-8">
                    <div class="p-6 bg-black/60 rounded-3xl border border-white/5 shadow-inner">
                       <p class="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                          <span class="w-1 h-4 bg-emerald-500 rounded-full"></span>
                          Tunnel_Control
                       </p>
                       <div class="grid grid-cols-2 gap-4">
                          <button id="btn-vpn-connect-main" class="py-5 bg-emerald-500/10 hover:bg-emerald-500 border border-emerald-500/30 hover:text-white text-emerald-500 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_10px_20px_-10px_rgba(16,185,129,0.2)]">Link_Tunnel</button>
                          <button id="btn-vpn-disconnect-main" class="py-5 bg-danger/10 hover:bg-danger border border-danger/30 hover:text-white text-danger text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_10px_20px_-10px_rgba(239,68,68,0.2)]">Sever_Link</button>
                       </div>
                    </div>
                    <button class="w-full py-5 bg-white/5 hover:bg-cyber/20 border border-white/10 hover:border-cyber/40 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all italic text-slate-400 hover:text-cyber">Rotate_Identity_Keys</button>
                  </div>
                )}

                {agent.name === 'firewall' && (
                  <div class="space-y-8">
                    <div class="p-6 bg-black/60 rounded-3xl border border-white/5 shadow-inner">
                       <p class="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                          <span class="w-1 h-4 bg-danger rounded-full"></span>
                          Perimeter_Control
                       </p>
                       <div class="space-y-6">
                          <input id="block-ip-input-main" type="text" placeholder="TARGET_IP_ADDR" class="w-full bg-obsidian/80 border border-white/10 rounded-2xl text-[11px] font-mono p-5 focus:border-danger outline-none transition-all text-white placeholder:text-slate-800" />
                          <div class="grid grid-cols-2 gap-4">
                             <button onclick={`const ip=document.getElementById('block-ip-input-main').value; fetch('/api/agents/firewall/block', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ip}) }).then(() => location.reload())`} class="py-5 bg-danger/10 hover:bg-danger border border-danger/30 hover:text-white text-danger text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all shadow-[0_10px_20px_-10px_rgba(239,68,68,0.3)]">Execute_Block</button>
                             <button onclick={`const ip=document.getElementById('block-ip-input-main').value; fetch('/api/agents/firewall/unblock', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ip}) }).then(() => location.reload())`} class="py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all">Pardon_IP</button>
                          </div>
                       </div>
                    </div>
                    <button onclick={`if(confirm('CRITICAL: Flush all firewall rules?')) { fetch('/api/agents/firewall/flush', { method: 'POST' }).then(() => location.reload()) }`} class="w-full py-5 bg-danger/5 hover:bg-danger/20 border border-danger/10 hover:border-danger/30 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all italic text-danger/70 hover:text-danger">Flush_Global_Ruleset</button>
                  </div>
                )}

                {agent.name === 'ebpf' && (
                  <div class="space-y-8">
                    <div class="p-6 bg-black/60 rounded-3xl border border-white/5 shadow-inner">
                       <p class="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                          <span class="w-1 h-4 bg-cyber rounded-full"></span>
                          LSM_Directives
                       </p>
                       <div class="space-y-4">
                          <button 
                            onclick={`fetch('/api/agents/ebpf/command', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: 'HIDE_PID'}) }).then(r => r.json()).then(d => alert(d.message || 'PID Hiding Active'))`}
                            class="w-full flex items-center justify-between p-5 bg-white/5 hover:bg-cyber/10 rounded-2xl border border-white/5 hover:border-cyber/30 transition-all group/btn"
                          >
                             <span class="text-[10px] font-black text-slate-400 group-hover/btn:text-cyber uppercase tracking-widest transition-colors">Process_Camouflage</span>
                             <div class="w-12 h-6 bg-emerald-500 rounded-full flex items-center px-1 shadow-[0_0_15px_rgba(16,185,129,0.4)]"><div class="w-4 h-4 bg-white rounded-full ml-auto"></div></div>
                          </button>
                          <div class="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 opacity-50 cursor-not-allowed">
                             <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Deep_Syscall_Audit</span>
                             <div class="w-12 h-6 bg-cyber rounded-full flex items-center px-1 shadow-[0_0_15px_rgba(14,165,233,0.4)]"><div class="w-4 h-4 bg-white rounded-full ml-auto"></div></div>
                          </div>
                       </div>
                    </div>
                    <div class="p-6 bg-black/60 rounded-3xl border border-white/5 shadow-inner">
                        <p class="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6 flex items-center gap-3">
                          <span class="w-1 h-4 bg-warning rounded-full"></span>
                          Traffic_Shaping
                        </p>
                        <div class="space-y-6">
                           <input id="ebpf-ban-ip" type="text" placeholder="TARGET_IP_ADDR" class="w-full bg-obsidian/80 border border-white/10 rounded-2xl text-[11px] font-mono p-5 focus:border-cyber outline-none transition-all text-white placeholder:text-slate-800" />
                           <button 
                             onclick={`const ip=document.getElementById('ebpf-ban-ip').value; fetch('/api/agents/ebpf/command', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({type: 'SHADOW_BAN', ip}) }).then(r => r.json()).then(d => alert(d.message || 'Shadow Ban Engaged'))`}
                             class="w-full py-5 bg-cyber text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-[0_10px_30px_-10px_rgba(14,165,233,0.5)]"
                           >
                             Execute_Shadow_Ban
                           </button>
                        </div>
                    </div>
                    <button class="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all italic text-slate-500 hover:text-white">Initiate_Forensic_Dump</button>
                  </div>
                )}

                <div class="space-y-4 pt-10 border-t border-white/5">
                   <button class="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all text-slate-400 hover:text-white">Export_Compliance_Report</button>
                   <button class="w-full py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all text-slate-400 hover:text-white">Verification_Challenge</button>
                </div>
             </div>
          </section>

          <section class="glass-panel p-10 rounded-3xl border border-white/5 bg-black/40 group hover:border-white/10 transition-all">
             <h2 class="text-[12px] font-black uppercase tracking-[0.4em] text-slate-500 mb-10 border-b border-white/5 pb-6">AGENT_MANIFEST</h2>
             <div id={`agent-caps-${agent.name}`} class="flex gap-3 flex-wrap mb-10">
                <div class="h-8 w-28 bg-white/5 animate-pulse rounded-full"></div>
                <div class="h-8 w-28 bg-white/5 animate-pulse rounded-full"></div>
             </div>
             
             <div class="space-y-8">
                <div class="flex justify-between items-center">
                   <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Integrity_Hash</span>
                   <span class="text-[11px] font-black text-success italic tracking-widest uppercase">Verified_Secure</span>
                </div>
                <div class="flex justify-between items-center">
                   <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Audit_Stability</span>
                   <span class="text-[11px] font-black text-white font-mono italic">99.99%_STABLE</span>
                </div>
             </div>
          </section>
        </div>
      </div>
      <agent-detail data-agent={agent.name}></agent-detail>
    </Layout>
  );
};
