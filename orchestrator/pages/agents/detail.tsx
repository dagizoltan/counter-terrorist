/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

export const AgentDetailPage = (props: { agent: { name: string; status: string; details?: any } }) => {
  const { agent } = props;

  return (
    <Layout title={`Agent: ${agent.name}`}>
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
             onclick={`fetch('/api/agents/${agent.name}/restart', { method: 'POST' }).then(() => location.reload())`}
             class="bg-white text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
           >
             Restart_Agent
           </button>
           <button 
             onclick={`fetch('/api/agents/${agent.name}/stop', { method: 'POST' }).then(() => location.reload())`}
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
           <p class="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-bold">Health: <span class="text-green-500">OPTIMAL</span></p>
        </div>

        {/* AGENT IDENTITY */}
        <div class="bg-white/5 p-8 border-l-2 border-slate-700">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Agent Identity</h3>
           <p class="text-2xl font-bold uppercase tracking-tight text-white">PID_7741</p>
           <p class="text-[10px] text-slate-400 mt-2 uppercase tracking-widest font-bold">Type: Persistent_Sidecar</p>
        </div>

        {/* SECURITY CONTEXT */}
        <div class="bg-white/5 p-8 border-l-2 border-slate-700">
           <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Security Context</h3>
           <div class="flex gap-2 mt-1">
              <span class="px-2 py-0.5 bg-white/10 text-[9px] font-black uppercase">CAP_NET_RAW</span>
              <span class="px-2 py-0.5 bg-white/10 text-[9px] font-black uppercase">CAP_SYS_ADMIN</span>
           </div>
           <p class="text-[10px] text-slate-400 mt-3 uppercase tracking-widest font-bold">Privilege: <span class="text-yellow-500">SUDO_ACCESS</span></p>
        </div>
      </div>

      {/* TELEMETRY STREAM */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <section class="bg-white/5 border border-white/5">
           <div class="p-6 border-b border-white/5 flex justify-between items-center">
              <h2 class="text-xs font-black uppercase tracking-[0.3em]">Telemetry Stream</h2>
              <div class="flex items-center gap-2">
                 <span class="text-[9px] text-slate-500 font-black uppercase">Live_Updates</span>
                 <div class="w-1.5 h-1.5 bg-red-600 animate-pulse"></div>
              </div>
           </div>
           <div class="p-6 font-mono text-[11px] h-[400px] overflow-y-auto bg-black/40 text-slate-400 space-y-1">
              <p><span class="text-slate-600">[11:16:01]</span> <span class="text-green-500">INITIALIZING</span> kernel module bridge...</p>
              <p><span class="text-slate-600">[11:16:02]</span> <span class="text-blue-500">SYNCING</span> protection rules with local DB...</p>
              <p><span class="text-slate-600">[11:16:05]</span> <span class="text-white">ENFORCEMENT</span> active on interface eth0</p>
              <p><span class="text-slate-600">[11:16:10]</span> <span class="text-slate-500">HEARTBEAT</span> signal received from master</p>
              <p><span class="text-slate-600">[11:16:15]</span> <span class="text-slate-500">HEARTBEAT</span> signal received from master</p>
              <p><span class="text-slate-600">[11:16:20]</span> <span class="text-slate-500">HEARTBEAT</span> signal received from master</p>
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
    </Layout>
  );
};
