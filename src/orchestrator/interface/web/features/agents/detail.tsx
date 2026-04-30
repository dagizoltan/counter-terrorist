/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AgentDetailPage = (props: { agent: { name: string; status: string; details?: any }, csrfToken?: string }) => {
  const { agent } = props;
  const islandPaths = ['/pages/dashboard/islands/BlockingLog.js', '/pages/dashboard/islands/AgentDetail.js'];

  return (
    <Layout title={`Agent: ${agent.name}`} islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div class="mb-12 flex justify-between items-end">
        <div>
           <div class="flex items-center gap-3 mb-2">
              <a href="/agents" class="text-slate-500 hover:text-white transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </a>
              <span class="text-slate-500 text-[10px] font-black uppercase tracking-widest">Defense_Agents / {agent.name}</span>
           </div>
           <h2 class="text-4xl font-black tracking-tighter uppercase">{agent.name}</h2>
        </div>
        <div class="flex gap-4">
           <button 
             onclick={`const csrf=document.querySelector('meta[name=\'csrf-token\']')?.content;fetch('/api/agents/${agent.name}/restart', { method: 'POST', headers: {'X-CT-Token': csrf} }).then(() => location.reload())`}
             class="bg-white text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
           >
             Restart_Agent
           </button>
           <button 
             onclick={`const csrf=document.querySelector('meta[name=\'csrf-token\']')?.content;fetch('/api/agents/${agent.name}/stop', { method: 'POST', headers: {'X-CT-Token': csrf} }).then(() => location.reload())`}
             class="border border-red-600/50 text-red-500 px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
           >
             Deactivate
           </button>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
        {/* AGENT STATUS CARD */}
        <div class="bg-white/5 p-8 border-l-2 border-green-500">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Current Status</h3>
           <p class="text-2xl font-bold uppercase tracking-tight text-white">{agent.status}</p>
           <p class="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-bold">Health: <span id={`agent-health-${agent.name}`} class="text-slate-500">CHECKING...</span></p>
        </div>

        {/* AGENT IDENTITY */}
        <div class="bg-white/5 p-8 border-l-2 border-slate-700">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Agent Identity</h3>
           <p id={`agent-pid-${agent.name}`} class="text-2xl font-bold uppercase tracking-tight text-white">...</p>
           <p class="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-bold">Type: Persistent_Sidecar</p>
        </div>

        {/* SECURITY CONTEXT */}
        <div class="bg-white/5 p-8 border-l-2 border-slate-700">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Security Context</h3>
           <div id={`agent-caps-${agent.name}`} class="flex gap-2 mt-1 flex-wrap">
              <span class="text-[9px] text-slate-500 font-bold uppercase">Loading capabilities...</span>
           </div>
           <p class="text-[10px] text-slate-400 mt-3 uppercase tracking-widest font-bold">Privilege: <span id={`agent-priv-${agent.name}`} class="text-slate-500">CHECKING</span></p>
        </div>
      </div>

      {/* TELEMETRY STREAM */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section class="bg-white/5 border border-white/5">
           <div class="p-6 border-b border-white/5 flex justify-between items-center">
              <h2 class="text-xs font-black uppercase tracking-[0.3em]">Live Event Stream</h2>
              <div class="flex items-center gap-2">
                 <span class="text-[9px] text-slate-500 font-black uppercase">Real_Time</span>
                 <div class="w-1.5 h-1.5 bg-red-600 animate-pulse"></div>
              </div>
           </div>
           <div class="min-h-[400px]">
              <blocking-log id={`agent-log-${agent.name}`}></blocking-log>
           </div>
        </section>

        <section class="bg-white/5 border border-white/5 p-6">
           <h2 class="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">Configuration Profile</h2>
           <div class="space-y-6">
              <div>
                 <p class="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">Auto_Restart</p>
                 <div class="flex items-center gap-4">
                    <div class="w-12 h-6 bg-white flex items-center px-1">
                       <div class="w-4 h-4 bg-black"></div>
                    </div>
                    <span class="text-[10px] font-black uppercase">Enabled</span>
                 </div>
              </div>
              <div>
                 <p class="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">Logging_Level</p>
                 <select class="bg-black border border-white/20 text-[10px] font-black uppercase p-2 w-full outline-none">
                    <option>DEBUG</option>
                    <option selected>INFORMATIONAL</option>
                    <option>WARNING</option>
                 </select>
              </div>
              <div>
                 <p class="text-[9px] font-black text-slate-500 uppercase mb-2 tracking-widest">Enforcement_Threshold</p>
                 <input type="range" class="w-full accent-white" />
                 <div class="flex justify-between mt-1">
                    <span class="text-[8px] font-black text-slate-600">0%</span>
                    <span class="text-[8px] font-black text-slate-600">100%</span>
                 </div>
              </div>
           </div>
        </section>
      </div>
      <agent-detail data-agent={agent.name}></agent-detail>
    </Layout>
  );
};
