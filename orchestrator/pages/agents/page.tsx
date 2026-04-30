/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";
import { ApplicationStatus } from "../../core/ports.ts";

export const AgentsPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const { plugins } = props.status;

  return (
    <Layout title="Agents" islandPaths={[
      '/pages/dashboard/islands/AgentCardIsland.js', 
      '/pages/dashboard/islands/MetricsHydrator.js',
      '/pages/agents/islands/SupplyChainIsland.js'
    ]} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Defense Agents</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Orchestrated Security Sidecars // Active Enforcers</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
        {plugins.map((agent) => (
          <div class="bg-black/40 border border-white/5 hover:border-blue-500/30 transition-all p-1 group relative">
            {/* Corner Accents */}
            <div class="absolute top-0 left-0 w-4 h-4 border-t border-l border-white/20 group-hover:border-blue-500 transition-all"></div>
            <div class="absolute bottom-0 right-0 w-4 h-4 border-b border-r border-white/20 group-hover:border-blue-500 transition-all"></div>
            
            <div class="p-6">
              <div class="flex justify-between items-center mb-6">
                <div class="flex items-center gap-3">
                  <div class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                  <h3 class="text-lg font-black uppercase tracking-tight text-white/90">{agent.name}</h3>
                </div>
                <span class={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                  {agent.status}
                </span>
              </div>

              {/* DYNAMIC WIDGET AREA */}
              <div class="bg-white/[0.02] border border-white/5 rounded p-4 mb-6">
                 <agent-card-island agent={agent.name}></agent-card-island>
              </div>

              <p class="text-[9px] text-slate-500 font-bold uppercase leading-relaxed mb-6 h-8 overflow-hidden">
                {agent.description || "Active security sidecar providing autonomous enforcement and real-time mesh telemetry."}
              </p>

              <div class="flex justify-between items-center pt-4 border-t border-white/5">
                <a href={`/agents/${agent.name}`} class="text-[9px] font-black uppercase tracking-widest text-blue-500 hover:text-white transition-all flex items-center gap-1">
                  <span>Open_Console</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </a>
                <div class="flex gap-3">
                   <button class="text-slate-600 hover:text-white transition-colors" title="Restart Agent">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
                   </button>
                   <button class="text-slate-600 hover:text-white transition-colors" title="View Config">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                   </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* HARDENING MATRIX ROW */}
      <div class="mb-6">
        <h3 class="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-4">Hardening Matrix // Kernel Parameters</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
           {[
             { id: 'stat-kernel-aslr', label: 'ASLR_PROTECTION', desc: 'Address Space Layout Randomization' },
             { id: 'stat-kernel-syncookies', label: 'SYN_COOKIES', desc: 'TCP flood mitigation' },
             { id: 'stat-kernel-rpfilter', label: 'RP_FILTER', desc: 'Source address validation' },
             { id: 'stat-audit-chain', label: 'AUDIT_INTEGRITY', desc: 'Blockchain-signed logs' }
           ].map(item => (
             <div class="bg-white/5 border border-white/5 p-6 hover:bg-white/[0.07] transition-all">
                <div class="flex justify-between items-start mb-4">
                  <span class="text-[9px] font-black text-slate-500 tracking-widest uppercase">{item.label}</span>
                  <div class="w-2 h-2 bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                </div>
                <div id={item.id} class="text-xl font-black text-white mb-2">LOADING...</div>
                <p class="text-[8px] text-slate-600 font-bold uppercase">{item.desc}</p>
             </div>
           ))}
        </div>
      </div>
      {/* SUPPLY CHAIN INTEGRITY */}
      <div class="mt-16">
        <div id="supply-chain-container"></div>
      </div>

      <metrics-hydrator></metrics-hydrator>

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { render } from 'preact';
        import SupplyChainIsland from '/pages/agents/islands/SupplyChainIsland.js';
        
        const container = document.getElementById('supply-chain-container');
        if (container) render(<SupplyChainIsland />, container);
      `}} />
    </Layout>
  );
};
