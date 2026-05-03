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
      '/components/islands/MetricsHydrator.js',
      '/components/islands/SupplyChainIsland.js'
    ]} csrfToken={props.csrfToken}>
      
      {/* 01_Header_Section */}
      <header class="flex justify-between items-end mb-16 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-primary rounded shadow-primary"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Agent_Fleet</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-success"></span>
                <span class="mono-xs font-black text-success tracking-widest uppercase">Orchestration_Synced</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">Nodes_In_Registry: {plugins.length.toString().padStart(2, '0')}</div>
            </div>
          </div>
        </div>
        <div class="flex gap-4 mb-2">
          <button class="t-btn group px-6 py-3">
             <span class="relative z-10">Provision_New_Node</span>
          </button>
          <button class="t-btn danger group px-6 py-3">
             <span class="relative z-10">Purge_Failed_Agents</span>
          </button>
        </div>
      </header>

      {/* 02_Endpoint_Registry */}
      <section class="mb-20 animate-fade-in" style="animation-delay: 100ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">01_ENDPOINT_REGISTRY_METADATA</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {plugins.map((agent) => (
            <div class="t-panel glass-panel group relative overflow-hidden border-t-2 border-slate-800 hover:border-primary/40 transition-all p-8">
                <div class="flex justify-between items-start mb-10">
                  <div class="flex flex-col gap-1">
                    <div class="flex items-center gap-3">
                       <span class={`dot ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'active shadow-success' : 'danger shadow-danger'}`}></span>
                       <h3 class="text-2xl font-black text-white uppercase tracking-tighter italic">{agent.name.toUpperCase()}</h3>
                    </div>
                    <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest pl-6">ID: \${agent.name.slice(0, 8)}_SIDE</span>
                  </div>
                  <div class="status-pill active py-1 px-3 shadow-inner" style="font-size: 8px;">
                    {agent.status}
                  </div>
                </div>

                <div class="bg-black/60 border border-white/5 rounded-lg p-6 mb-8 shadow-inner group-hover:bg-black/80 transition-colors">
                   <agent-card-island agent={agent.name}></agent-card-island>
                </div>

                <p class="mono-xs text-slate-500 mb-10 leading-relaxed font-bold uppercase tracking-tight opacity-50 group-hover:opacity-100 transition-opacity">
                  {agent.description || "Active security sidecar providing autonomous enforcement and real-time mesh telemetry."}
                </p>

                <div class="flex justify-between items-center pt-8 border-t border-white/5">
                  <a href={`/agents/\${agent.name}`} class="t-btn text-[10px] py-2 px-6">Open_Agent_Console</a>
                  <div class="flex gap-4">
                      <div class="p-3 bg-white/5 border border-white/5 rounded hover:border-primary/40 text-slate-600 hover:text-primary cursor-pointer transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                      </div>
                  </div>
                </div>
            </div>
          ))}
        </div>
      </section>

      {/* 03_Hardening_Matrix */}
      <section class="mb-20 animate-fade-in" style="animation-delay: 200ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">02_SOVEREIGN_HARDENING_MATRIX</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-8">
           {[
             { id: 'stat-kernel-aslr', label: 'ASLR_PROTECTION', desc: 'Layout_Randomization' },
             { id: 'stat-kernel-syncookies', label: 'SYN_COOKIES', desc: 'Flood_Mitigation' },
             { id: 'stat-kernel-rpfilter', label: 'RP_FILTER', desc: 'Source_Validation' },
             { id: 'stat-anon-mode', label: 'ANONYMIZATION', desc: 'Stealth_Provider' },
             { id: 'stat-audit-chain', label: 'AUDIT_INTEGRITY', desc: 'Immutable_Chain' }
           ].map(item => (
             <div class="t-panel glass-panel border-t-2 border-slate-800 p-8 transition-all hover:bg-white/[0.02]">
                <div class="flex justify-between items-center mb-8">
                  <span class="mono-xs font-black text-slate-600 tracking-widest uppercase">{item.label}</span>
                  <span class="dot active shadow-success"></span>
                </div>
                <div id={item.id} class="text-3xl font-black text-white tabular-nums mb-4 uppercase tracking-tighter italic">Initializing...</div>
                <div class="flex items-center gap-3">
                   <div class="w-1 h-3 bg-primary rounded"></div>
                   <p class="mono-xs text-slate-700 uppercase font-black tracking-widest leading-none">{item.desc}</p>
                </div>
             </div>
           ))}
        </div>
      </section>

      {/* 04_Supply_Chain */}
      <section class="animate-fade-in" style="animation-delay: 300ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">03_SUPPLY_CHAIN_PROVENANCE_LOG</h2>
        <div id="supply-chain-container" class="t-panel glass-panel p-0 overflow-hidden min-h-[440px] flex items-center justify-center border-dashed opacity-30">
            <div class="flex flex-col items-center gap-6">
               <div class="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin shadow-primary"></div>
               <div class="mono-xs font-black text-primary tracking-[0.4em] uppercase animate-pulse">Initializing_Validator_Chain...</div>
            </div>
        </div>
      </section>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
