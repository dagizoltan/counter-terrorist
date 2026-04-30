/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";
import { ApplicationStatus } from "../../core/ports.ts";

export const AgentsPage = (props: { status: ApplicationStatus }) => {
  const { plugins } = props.status;

  return (
    <Layout title="Agents">
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Defense Agents</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Orchestrated Security Sidecars // Active Enforcers</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {plugins.map((agent) => (
          <div class="bg-white/5 border border-white/5 hover:border-white/20 transition-all p-8 flex flex-col group">
            <div class="flex justify-between items-start mb-6">
              <div class="w-10 h-10 bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white group-hover:text-black transition-all">
                <span class="text-xs font-black uppercase">{agent.name.substring(0, 2)}</span>
              </div>
              <div class="flex flex-col items-end">
                <span class="text-[9px] font-black text-slate-500 tracking-widest uppercase mb-1">Status</span>
                <span class={`text-[10px] font-bold uppercase tracking-wider ${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'text-green-500' : 'text-red-500'}`}>
                  {agent.status}
                </span>
              </div>
            </div>

            <h3 class="text-xl font-bold uppercase tracking-tight mb-2 group-hover:text-white transition-colors">{agent.name}</h3>
            <p class="text-xs text-slate-500 font-medium mb-8">System-level sidecar providing real-time telemetry and enforcement.</p>

            <div class="mt-auto pt-6 border-t border-white/5 flex justify-between items-center">
              <a href={`/agents/${agent.name}`} class="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-all">
                View_Details →
              </a>
              <div class="flex gap-2">
                 <button class="w-2 h-2 bg-white/10 hover:bg-red-500 transition-all" title="Restart Agent"></button>
                 <button class="w-2 h-2 bg-white/10 hover:bg-white transition-all" title="Agent Logs"></button>
              </div>
            </div>
          </div>
        ))}

        {/* MOCK AGENTS FOR UI DEPTH */}
        <div class="bg-white/5 border border-white/5 border-dashed p-8 flex flex-col opacity-30 cursor-not-allowed">
           <div class="w-10 h-10 border border-white/10 flex items-center justify-center mb-6">
             <span class="text-xs font-black opacity-20">+</span>
           </div>
           <h3 class="text-xl font-bold uppercase tracking-tight mb-2">Network_Gossip</h3>
           <p class="text-xs text-slate-500 font-medium mb-8">P2P Mesh synchronization agent for cluster-wide blocking.</p>
           <div class="mt-auto pt-6 border-t border-white/5">
              <span class="text-[10px] font-black uppercase tracking-widest text-slate-600">Locked_Development</span>
           </div>
        </div>
      </div>
    </Layout>
  );
};
