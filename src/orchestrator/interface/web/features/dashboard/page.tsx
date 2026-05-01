import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

export const Dashboard = (props: { status: any; csrfToken: string }) => {
  const { os, platform } = props.status;
  const metrics = platform?.metrics;

  const islandPaths = [
    '/components/islands/BlockingLog.js',
    '/components/islands/ProcessTree.js',
    '/components/islands/MetricsHydrator.js'
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

      {/* LAYERED TELEMETRY SECTORS */}
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-12 mb-16">
        
        {/* SECTOR 01: NETWORK ENVELOPE */}
        <div class="glass-panel rounded-2xl border border-cyber/10 p-8 shadow-[0_0_50px_rgba(0,210,255,0.03)] flex flex-col">
          <div class="flex items-center justify-between mb-8 pb-4 border-b border-cyber/10">
             <div class="flex items-center gap-3">
                <span class="text-[10px] font-black text-cyber uppercase tracking-[0.3em]">Sector_01 // Network_Envelope</span>
             </div>
             <div class="px-2 py-0.5 rounded bg-cyber/10 border border-cyber/30 text-cyber text-[8px] font-black uppercase italic">Stealth_Active</div>
          </div>
          <div class="flex-grow space-y-8">
             <div class="flex justify-between items-end">
                <div>
                   <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Exit_Anonymizer</span>
                   <div id="stat-vpn-status" class="text-xl font-black text-white italic">SEARCHING...</div>
                </div>
                <div id="stat-anon-mode" class="text-[10px] font-mono text-cyber/60">OFF</div>
             </div>
             <div>
                <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Geo_Diversity</span>
                <div id="stat-geo-diversity" class="text-3xl font-black text-white tracking-tighter">0 Origins</div>
             </div>
          </div>
          <div class="mt-12 pt-6 border-t border-white/5">
             <a href="/network" class="w-full flex items-center justify-center p-3 rounded-lg bg-cyber/5 hover:bg-cyber/10 border border-cyber/10 text-[9px] font-black text-cyber uppercase tracking-widest transition-all">Configure_Shield</a>
          </div>
        </div>

        {/* SECTOR 02: MESH FABRIC */}
        <div class="glass-panel rounded-2xl border border-emerald-500/10 p-8 shadow-[0_0_50px_rgba(16,185,129,0.03)] flex flex-col">
          <div class="flex items-center justify-between mb-8 pb-4 border-b border-emerald-500/10">
             <div class="flex items-center gap-3">
                <span class="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]">Sector_02 // Mesh_Fabric</span>
             </div>
             <div class="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[8px] font-black uppercase italic">Quorum_Lock</div>
          </div>
          <div class="flex-grow space-y-8">
             <div class="flex justify-between items-end">
                <div>
                   <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Sync_Integrity</span>
                   <div class="text-xl font-black text-white italic">VERIFIED</div>
                </div>
                <div class="text-[10px] font-mono text-emerald-500/60">99.9%</div>
             </div>
             <div>
                <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Connected_Nodes</span>
                <div id="stat-mesh-nodes" class="text-3xl font-black text-white tracking-tighter">1 ACTIVE</div>
             </div>
          </div>
          <div class="mt-12 pt-6 border-t border-white/5">
             <a href="/mesh" class="w-full flex items-center justify-center p-3 rounded-lg bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 text-[9px] font-black text-emerald-400 uppercase tracking-widest transition-all">Mesh_Topology</a>
          </div>
        </div>

        {/* SECTOR 03: NODE INTEGRITY */}
        <div class="glass-panel rounded-2xl border border-white/5 p-8 flex flex-col">
          <div class="flex items-center justify-between mb-8 pb-4 border-b border-white/5">
             <div class="flex items-center gap-3">
                <span class="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Sector_03 // Node_Integrity</span>
             </div>
             <div class="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 text-[8px] font-black uppercase italic">Active_Scan</div>
          </div>
          <div class="flex-grow space-y-8">
             <div class="flex justify-between items-end">
                <div>
                   <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">eBPF_Guardian</span>
                   <div id="stat-forensics-ebpf-status" class="text-xl font-black text-white italic">RUNNING</div>
                </div>
             </div>
             <div>
                <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-2">Host_Defense_Count</span>
                <div id="stat-protection-count" class="text-3xl font-black text-white tracking-tighter">3 ACTIVE</div>
             </div>
          </div>
          <div class="mt-12 pt-6 border-t border-white/5">
             <a href="/agents" class="w-full flex items-center justify-center p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black text-white uppercase tracking-widest transition-all">Agent_Fleet</a>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-1 gap-12">
        {/* ANALYTICS SECTORS */}
        <section class="glass-panel rounded-xl p-8 border border-white/5">
          <h2 class="text-[11px] font-black uppercase tracking-[0.3em] mb-8 text-slate-300 border-b border-white/5 pb-4">Tactical_Forensics</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div class="flex justify-between items-center">
                <span class="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Audit_Chain</span>
                <div id="stat-audit-chain" class="text-[9px] font-mono text-emerald-400">VERIFIED</div>
             </div>
             <div class="flex justify-between items-center">
                <span class="text-[10px] font-bold text-slate-400 tracking-widest uppercase">Integrity_Hash</span>
                <div class="text-[9px] font-mono text-cyber/60">SHA-256_ACTIVE</div>
             </div>
          </div>
          <div class="mt-8 pt-6 border-t border-white/5 flex gap-4">
             <button class="flex-grow py-3 bg-danger/5 hover:bg-danger/10 border border-danger/10 text-danger/80 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all">Emergency_Wipe</button>
             <button class="flex-grow py-3 bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all">Export_Audit_Logs</button>
          </div>
        </section>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
