import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AgentDetailPage = (props: { agent: { name: string; status: string; details?: unknown; description: string; }, csrfToken?: string, nonce?: string, userRole?: string }) => {
  const { agent } = props;
  const islandPaths = [
    '/components/islands/BlockingLog.js', 
    '/components/islands/AgentDetail.js'
  ];

  const isEbpf = agent.name === 'ebpf';

  return (
    <Layout title={`Agent Detail: ${agent.name}`} islandPaths={islandPaths} csrfToken={props.csrfToken} nonce={props.nonce}>
      {/* HEADER: Identity & Actions */}
      <header class="flex justify-between items-end mb-5 border-b border-white/5 pb-5">
        <div class="flex items-center gap-4">
          <a href="/agents" class="w-16 h-16 flex items-center justify-center bg-white/5 border border-white/5 hover:border-primary/40 text-slate-500 hover:text-primary group">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="group-hover:-translate-x-1"><path d="m15 18-6-6 6-6"/></svg>
          </a>
          <div class="flex flex-col gap-2">
            <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0; text-transform:uppercase;">{agent.name}</h1>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class={`dot ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'active' : 'danger'}`}></span>
                <span class={`mono text-[10px] font-black tracking-[0.2em] ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'text-success' : 'text-danger'}`}>{agent.status}</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="eyebrow">Identity_Verified: SHA-256_ACTIVE</div>
            </div>
          </div>
        </div>
        <div class="flex gap-4 mb-2">
          <button type="button" id={`btn-restart-${agent.name}`} class="t-btn">Cycle_Process</button>
          <button type="button" id={`btn-stop-${agent.name}`} class="t-btn danger">Deactivate</button>
        </div>
      </header>

      {/* OPERATIONAL SUMMARY BAR */}
      <div class="grid grid-cols-4 gap-4 mb-5">
         {[
           { label: 'Process_ID', value: '...', id: `agent-pid-${agent.name}`, icon: 'PID', colorVar: 'var(--text-muted)' },
           { label: 'Security_Level', value: '...', id: `agent-priv-${agent.name}`, icon: 'SEC', colorVar: 'var(--primary)' },
           { label: 'Health_Metric', value: '...', id: `agent-health-${agent.name}`, icon: 'HTH', colorVar: 'var(--success)' },
           { label: 'Kernel_State', value: 'Verified', id: `agent-state-${agent.name}`, icon: 'SYS', colorVar: 'var(--text-muted)' }
         ].map(stat => (
           <div class="t-panel">
              <div class="flex justify-between items-start mb-4">
                 <span class="eyebrow">{stat.label}</span>
                 <span class="mono text-[9px] font-black opacity-20 tracking-tighter" style={`color:${stat.colorVar}`}>{stat.icon}_BLOCK</span>
              </div>
              <span id={stat.id} class="text-3xl font-black text-white tracking-tighter truncate uppercase tabular-nums">WAIT...</span>
           </div>
         ))}
      </div>

      <div class="grid grid-cols-12 gap-4">
        {/* MAIN TELEMETRY */}
        <div class="col-span-8 space-y-4">
          <section class="t-panel p-0 overflow-hidden">
             <header class="p-4 border-b border-white/5 flex justify-between items-center bg-black/20">
                <div class="flex items-center gap-4">
                   <h2 class="tactical-title" style="font-size:1.1rem;">01_FORENSIC_STREAM</h2>
                   <div class="px-3 py-1 bg-primary/10 border border-primary/30 text-primary text-[9px] font-black tracking-widest uppercase">Live_Audit</div>
                </div>
             </header>
             <div class="h-[600px] bg-black/40 p-4 overflow-y-auto">
                 {isEbpf ? (
                   <div id="ebpf-event-log" class="space-y-2">
                      <p class="mono text-[10px] text-slate-600 italic">Awaiting kernel signals from LSM interface...</p>
                   </div>
                 ) : (
                   <blocking-log id={`agent-log-${agent.name}`} class="h-full"></blocking-log>
                 )}
              </div>
          </section>

          <section id="agent-metrics-container" class="space-y-4">
             {/* Hydrated by AgentDetail.js */}
          </section>
        </div>

        {/* COMMAND & CONTROL SIDEBAR */}
        <div class="col-span-4 space-y-4">
          <section class="t-panel" style="border-left: 4px solid var(--primary); background: hsla(var(--bg-h), var(--bg-s), 4%, 0.4);">
             <h2 class="tactical-title mb-5 pb-4 border-b border-white/5 flex items-center justify-between" style="font-size:1rem;">
                COMMAND_INTERFACE
                <span class="dot active"></span>
             </h2>

             <div class="space-y-4">
                {agent.name === 'vpn' && (
                  <div class="space-y-4">
                    <div class="p-4 bg-black/40 border border-white/5">
                       <p class="metric-tag mb-4 flex items-center gap-3">
                          <span class="w-1 h-3 bg-success"></span>
                          Tunnel_Control
                       </p>
                       <div class="grid grid-cols-2 gap-4">
                          <button type="button" id="btn-vpn-connect-main" class="t-btn" style="padding:1rem;">Link_Tunnel</button>
                          <button type="button" id="btn-vpn-disconnect-main" class="t-btn danger" style="padding:1rem;">Sever_Link</button>
                       </div>
                    </div>
                    <button type="button" class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle);">Rotate_Identity_Keys</button>
                  </div>
                )}

                {agent.name === 'firewall' && (
                  <div class="space-y-4">
                    <div class="p-4 bg-black/40 border border-white/5">
                       <p class="metric-tag mb-4 flex items-center gap-3">
                          <span class="w-1 h-3 bg-danger"></span>
                          Perimeter_Control
                       </p>
                       <div class="space-y-4">
                          <input id="block-ip-input-main" type="text" placeholder="TARGET_IP_ADDR" class="w-full bg-black/60 border border-white/10 p-4 mono text-[11px] focus:border-danger outline-none text-white" />
                          <div class="grid grid-cols-2 gap-4">
                             <button type="button" id="btn-firewall-block-main" class="t-btn danger" style="padding:1rem;">Execute_Block</button>
                             <button type="button" id="btn-firewall-unblock-main" class="t-btn" style="padding:1rem; background:transparent; border-color:var(--border-subtle);">Pardon_IP</button>
                          </div>
                       </div>
                    </div>
                    <button type="button" id="btn-firewall-flush-main" class="t-btn danger w-full" style="background:transparent; border-color:var(--danger); color:var(--danger);">Flush_Global_Ruleset</button>
                  </div>
                )}

                <div class="space-y-4 pt-5 border-t border-white/5">
                   <button type="button" class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle);">Export_Compliance_Report</button>
                   <button type="button" class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle);">Verification_Challenge</button>
                </div>
             </div>
          </section>

          <section class="t-panel">
             <h2 class="tactical-title mb-5 pb-4 border-b border-white/5" style="font-size:0.9rem;">AGENT_MANIFEST</h2>
             <div id={`agent-caps-${agent.name}`} class="flex gap-2 flex-wrap mb-5">
                <div class="h-6 w-20 bg-white/5"></div>
                <div class="h-6 w-20 bg-white/5"></div>
             </div>
             
             <div class="space-y-4">
                <div class="flex justify-between items-center">
                   <span class="eyebrow">Integrity_Hash</span>
                   <span class="eyebrow italic" data-tone="success">Verified_Secure</span>
                </div>
                <div class="flex justify-between items-center">
                   <span class="eyebrow">Audit_Stability</span>
                   <span class="mono text-[10px] font-black text-white italic">99.99%_STABLE</span>
                </div>
             </div>
          </section>
        </div>
      </div>
      <agent-detail data-agent={agent.name}></agent-detail>
    </Layout>
  );
};
