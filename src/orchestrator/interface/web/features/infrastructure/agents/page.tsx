import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * Atomic Agents Page
 * Hardened agent management with high-fidelity tactical grid.
 */
export const AgentsPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const { plugins } = props.status;

  return (
    <Layout title="Agent Registry // Fleet Command" islandPaths={[
      '/components/islands/AgentCardIsland.js',
      '/components/islands/ProcessTree.js'
    ]} csrfToken={props.csrfToken}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Agent Fleet</h1>
          <span class="subtitle">Orchestration Synced // Nodes in Registry: {plugins.length.toString().padStart(2, '0')}</span>
        </div>
        <div class="flex gap-4">
          <button class="t-btn px-6 py-3 text-[9px]">
            Provision Node
          </button>
          <button class="t-btn px-6 py-3 text-[9px] border-danger text-danger">
            Purge Failed
          </button>
        </div>
      </header>

      <section class="mb-20" >
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">01 ENDPOINT REGISTRY METADATA</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plugins.map((agent) => (
            <div class="t-panel glass-panel group relative border-t-2 border-slate-800 hover:border-primary/40">
                <div class="flex justify-between items-start mb-10">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-3">
                       <span class={`dot ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'active' : 'danger'}`}></span>
                       <h3 class="text-2xl font-black text-white uppercase tracking-tighter italic">{agent.name.toUpperCase()}</h3>
                    </div>
                    <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest pl-6">ID: {agent.name.slice(0, 8)} SIDE</span>
                  </div>
                  <div class="status-pill success">
                    {agent.status}
                  </div>
                </div>

                <div class="bg-black/60 border border-white/5 rounded-lg p-6 mb-8">
                   <agent-card-island agent={agent.name}></agent-card-island>
                </div>

                <p class="mono-xs text-slate-500 mb-10 leading-relaxed font-bold uppercase tracking-tight opacity-50">
                  {agent.description || "Active security sidecar providing autonomous enforcement and real-time mesh telemetry."}
                </p>

                <div class="flex justify-between items-center pt-8 border-t border-white/5">
                  <a href={
                    agent.name === 'firewall' ? '/agents/firewall' :
                    agent.name === 'vpn' ? '/agents/vpn' :
                    agent.name === 'mesh' ? '/agents/mesh' :
                    agent.name === 'honeypot' ? '/agents/deception' :
                    `/agents/${agent.name}`
                  } class="t-btn text-[10px] py-2 px-6">Open Agent Console</a>
                  <div class="flex gap-4">
                      <div class="p-3 bg-white/5 border border-white/5 rounded hover:border-primary/40 text-slate-600 hover:text-primary cursor-pointer">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                      </div>
                  </div>
                </div>
            </div>
          ))}
        </div>
      </section>

      {/* 03_Hardening_Matrix */}
      <section class="mb-20" >
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">02 SOVEREIGN HARDENING MATRIX</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
           {[
             { id: 'stat-kernel-aslr', label: 'ASLR PROTECTION', desc: 'Layout Randomization' },
             { id: 'stat-kernel-syncookies', label: 'SYN COOKIES', desc: 'Flood Mitigation' },
             { id: 'stat-kernel-rpfilter', label: 'RP FILTER', desc: 'Source Validation' },
             { id: 'stat-anon-mode', label: 'ANONYMIZATION', desc: 'Stealth Provider' },
             { id: 'stat-audit-chain', label: 'AUDIT INTEGRITY', desc: 'Immutable Chain' }
           ].map(item => (
              <div class="t-panel glass-panel border-t-2 border-slate-800 hover:bg-white/[0.02]">
                <div class="flex justify-between items-center mb-8">
                  <span class="mono-xs font-black text-slate-600 tracking-widest uppercase">{item.label}</span>
                  <span class="dot active"></span>
                </div>
                <div id={item.id} class="text-2xl font-bold text-white tabular-nums mb-4 uppercase tracking-tight italic">Initializing...</div>
                <div class="flex items-center gap-3">
                   <div class="w-1 h-3 bg-primary rounded"></div>
                   <p class="mono-xs text-slate-700 uppercase font-black tracking-widest leading-none">{item.desc}</p>
                </div>
             </div>
           ))}
        </div>
      </section>

       <section class="mb-20" >
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">03 KERNEL EXECUTION TOPOLOGY</h2>
        <div class="t-panel glass-panel p-0 border-t-2 border-primary group overflow-hidden">
            <header class="p-6 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
               <div class="flex items-center gap-4">
                  <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-xl">
                     <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <div>
                     <h3 class="tactical-title text-xl tracking-widest">REALTIME LINUX LSM STREAM</h3>
                     <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Causal mapping of thread lineages and unauthorized drifts</p>
                  </div>
               </div>
               <div class="status-pill active primary">Analyzing Namespace</div>
            </header>
            
            <div class="p-8 bg-black/20 min-h-[500px] overflow-x-auto custom-scrollbar relative">
               <div class="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(circle_at_center,_var(--primary)_0%,_transparent_70%)]"></div>
               <process-tree></process-tree>
            </div>
            
            <footer class="p-8 border-t border-white/5 bg-black/10 flex justify-between items-center">
               <div class="flex gap-4">
                  <div class="flex items-center gap-4">
                     <div class="w-2 h-2 bg-primary rounded-full"></div>
                     <span class="mono-xs text-slate-700 font-black uppercase tracking-[0.2em]">SOVEREIGN THREAD</span>
                  </div>
               </div>
               <span class="mono-xs text-slate-700 font-black uppercase tracking-[0.3em]">Isolation Level: <span class="text-slate-400">KERNEL STRICT</span></span>
            </footer>
        </div>
      </section>

       <section class="animate-fade-in" >
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">04 SOVEREIGN INTEGRITY PROVENANCE</h2>
        <div class="t-panel glass-panel border-t-2 border-success/30 flex justify-between items-center p-8 group hover:bg-white/[0.02]">
           <div class="flex items-center gap-6">
              <div class="p-6 bg-success/10 border border-success/30 text-success rounded-2xl">
                 <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              </div>
              <div class="flex flex-col gap-2">
                 <h3 class="tactical-title text-2xl tracking-widest">SUPPLY CHAIN VERIFIED</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">All active dependencies cryptographically signed and audited</p>
              </div>
           </div>
           <a href="/supply-chain" class="t-btn success px-10 py-5 text-[10px] font-black uppercase tracking-[0.3em]">Inspect Full Provenance</a>
        </div>
      </section>


    </Layout>
  );
};
