import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

export const Dashboard = (props: { status: any; csrfToken: string }) => {
  const { os, platform } = props.status;
  const metrics = platform?.metrics;

  const islandPaths = [
    '/features/dashboard/islands/BlockingLog.js',
    '/features/dashboard/islands/ProcessTree.js',
    '/features/dashboard/islands/MetricsHydrator.js'
  ];

  return (
    <Layout title="Command Console" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* Top Header Section */}
      <div class="flex justify-between items-center mb-12">
        <div>
          <h1 class="text-3xl font-black tracking-widest uppercase mb-2">Tactical_Overview</h1>
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Autonomous_Defense_Mesh // v4.2-STABLE</p>
        </div>
        <div class="flex gap-4">
           <button class="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
             Global_Sweep
           </button>
           <button class="px-6 py-2 bg-danger/10 hover:bg-danger/20 border border-danger/20 text-danger rounded-lg text-[10px] font-black uppercase tracking-widest transition-all">
             Node_Isolation
           </button>
        </div>
      </div>

      {/* PRIMARY METRICS GRID */}
      <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
        <div class="glass-panel p-8 rounded-xl relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          </div>
          <div class="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-6">CPU_Load</div>
          <div class="text-4xl font-mono font-bold text-cyber">{metrics?.cpu.load[0]?.toFixed(2) || "0.00"}</div>
          <div class="mt-6 h-1.5 bg-white/5 rounded-full overflow-hidden">
             <div class="h-full bg-gradient-to-r from-cyber/40 to-cyber transition-all duration-1000" style={`width: ${Math.min(((metrics?.cpu.load?.[0] || 0) * 10), 100)}%`}></div>
          </div>
        </div>

        <div class="glass-panel p-8 rounded-xl relative overflow-hidden group">
          <div class="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div class="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-6">Memory_Util</div>
          <div class="text-4xl font-mono font-bold">{Math.floor((metrics?.memory?.used || 0) / 1024 / 1024)}<span class="text-lg text-slate-600 ml-1">MB</span></div>
          <div class="mt-6 h-1.5 bg-white/5 rounded-full overflow-hidden">
             <div class="h-full bg-gradient-to-r from-slate-700 to-slate-400" style={`width: ${Math.min(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100, 100)}%`}></div>
          </div>
        </div>

        <div class="glass-panel p-8 rounded-xl relative overflow-hidden">
          <div class="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-6">Active_Defense</div>
          <div id="stat-protection-count" class="text-4xl font-mono font-bold text-emerald-500">INIT...</div>
          <div class="mt-4 flex gap-1">
             <div class="w-2 h-1 bg-emerald-500"></div>
             <div class="w-2 h-1 bg-emerald-500"></div>
             <div class="w-2 h-1 bg-emerald-500"></div>
             <div class="w-2 h-1 bg-white/10"></div>
          </div>
        </div>

        <div class="glass-panel p-8 rounded-xl relative overflow-hidden border-l-4 border-warning/20">
          <div class="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-6">Threat_Level</div>
          <div class="text-4xl font-mono font-bold text-warning uppercase">Nominal</div>
          <div class="mt-4 text-[9px] font-black text-slate-600 tracking-[0.2em] uppercase">No active incursions</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* LEFT COLUMN: EVENTS */}
        <div class="lg:col-span-2 space-y-12">
          <section>
            <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
               <h2 class="text-xs font-black uppercase tracking-[0.4em] text-slate-400 italic">Intercepted_Packets</h2>
               <div class="flex items-center gap-4">
                  <div class="px-3 py-1 rounded-full bg-danger/10 border border-danger/20 text-danger text-[9px] font-black tracking-widest">LIVE_CAPTURE</div>
               </div>
            </div>
            <div class="glass-panel rounded-xl overflow-hidden shadow-2xl h-[400px]">
               <blocking-log id="main-log"></blocking-log>
            </div>
          </section>

          <section>
            <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
               <h2 class="text-xs font-black uppercase tracking-[0.4em] text-slate-400 italic">Kernel_Behavior_Map</h2>
            </div>
            <div class="glass-panel rounded-xl p-8 h-[400px] overflow-y-auto custom-scrollbar">
               <process-tree></process-tree>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: SIDEBAR CONTROLS */}
        <div class="space-y-12">
          <section class="glass-panel rounded-xl p-8 border border-cyber/10 shadow-[0_0_50px_rgba(0,210,255,0.03)]">
            <h2 class="text-[11px] font-black uppercase tracking-[0.3em] mb-8 text-cyber border-b border-cyber/10 pb-4">Defense_Enforcement</h2>
            <div class="space-y-6">
               <div class="flex justify-between items-center">
                  <span class="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Firewall_Shield</span>
                  <div class="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black rounded uppercase">Active</div>
               </div>
               <div class="flex justify-between items-center">
                  <span class="text-[10px] font-bold text-slate-400 tracking-widest uppercase">eBPF_Sidecar</span>
                  <div id="stat-forensics-ebpf-status" class="px-2 py-1 bg-cyber/10 border border-cyber/30 text-cyber text-[8px] font-black rounded uppercase italic">Wait...</div>
               </div>
               <div class="flex justify-between items-center">
                  <span class="text-[10px] font-bold text-slate-400 tracking-widest uppercase">FIM_Guardian</span>
                  <div id="stat-forensics-fim-status" class="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black rounded uppercase italic">Active</div>
               </div>
               
               <div class="pt-6 border-t border-white/5 space-y-4">
                  <button class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all">Rotate_Honeypots</button>
                  <button class="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all">Flush_Audit_Logs</button>
               </div>
            </div>
          </section>

          <section class="glass-panel rounded-xl p-8 border border-white/5">
            <h2 class="text-[11px] font-black uppercase tracking-[0.3em] mb-8 text-slate-300 border-b border-white/5 pb-4">Mesh_Status</h2>
            <div class="space-y-4">
               <div class="p-4 bg-black/40 rounded-lg border border-white/5">
                  <div class="flex justify-between items-center mb-2">
                     <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Active_Nodes</span>
                     <span id="stat-mesh-nodes" class="text-[10px] font-mono text-white italic">Searching...</span>
                  </div>
                  <div id="stat-mesh-handshakes" class="text-[8px] font-bold text-cyber/40 uppercase tracking-tighter">Initializing discovery...</div>
               </div>
               <div class="p-4 bg-black/40 rounded-lg border border-white/5">
                  <div class="flex justify-between items-center mb-2">
                     <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Audit_Integrity</span>
                     <span id="stat-audit-chain" class="text-[10px] font-mono text-emerald-400">UNVERIFIED</span>
                  </div>
               </div>
            </div>
          </section>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
