import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

export const Dashboard = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const { os, platform } = props.status;
  const metrics = platform?.metrics;

  const islandPaths = [
    '/pages/dashboard/islands/BlockingLog.js',
    '/pages/dashboard/islands/ProcessTree.js',
    '/pages/dashboard/islands/MetricsHydrator.js'
  ];

  return (
    <Layout title="Dashboard" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* Top Header Section */}
      <div class="flex justify-between items-end mb-10">
        <div>
          <h2 class="text-3xl font-black tracking-tighter uppercase mb-2">Command Console</h2>
          <div class="flex items-center gap-4 text-[10px] font-medium tracking-widest uppercase text-slate-500">
            <span>UPTIME: <span class="text-white">{Math.floor((metrics?.uptime || 0) / 3600)}H {Math.floor(((metrics?.uptime || 0) % 3600) / 60)}M</span></span>
            <span class="w-1 h-1 bg-slate-700 rounded-full"></span>
            <span>KERNEL: <span class="text-white">{os}</span></span>
          </div>
        </div>
        <div class="flex gap-4">
           <button class="px-6 py-2 border border-danger/20 bg-danger/5 text-danger text-[10px] font-black uppercase tracking-widest hover:bg-danger/10 transition-all">Emergency_Lockdown</button>
        </div>
      </div>

      {/* CORE METRICS GRID */}
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div class="glass-panel p-6 rounded-lg">
          <div class="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-4">System_Load</div>
          <div class="text-3xl font-mono font-bold">{metrics?.cpu.load[0].toFixed(2)}</div>
          <div class="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
             <div class="h-full bg-cyber" style={`width: ${Math.min((metrics?.cpu.load[0] || 0) * 10, 100)}%`}></div>
          </div>
        </div>
        <div class="glass-panel p-6 rounded-lg">
          <div class="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-4">Memory_Usage</div>
          <div class="text-3xl font-mono font-bold">{Math.floor((metrics?.memory.used || 0) / 1024 / 1024)}<span class="text-sm text-slate-500 ml-1">MB</span></div>
          <div class="mt-4 h-1 bg-white/5 rounded-full overflow-hidden">
             <div class="h-full bg-cyber" style={`width: ${Math.min(((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100, 100)}%`}></div>
          </div>
        </div>
        <div class="glass-panel p-6 rounded-lg border-l-2 border-l-warning">
          <div class="text-[10px] font-black text-slate-500 tracking-widest uppercase mb-4">Mirror_World</div>
          <div class="text-3xl font-mono font-bold text-warning">SECURE</div>
          <div class="mt-2 text-[9px] font-bold text-slate-500 uppercase tracking-wider">Zero sessions contained</div>
        </div>
      </div>

      {/* THREAT STREAM */}
      <div class="mb-10">
        <div class="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
           <h2 class="text-xs font-black uppercase tracking-[0.3em]">Tactical Event Stream</h2>
           <div class="flex items-center gap-4">
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Live_Feed</span>
              <div class="w-1.5 h-1.5 bg-danger animate-pulse"></div>
           </div>
        </div>
        <div class="glass-panel rounded-lg overflow-hidden">
           <blocking-log id="main-log"></blocking-log>
        </div>
      </div>

      {/* PROCESS HIERARCHY */}
      <div>
        <div class="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
           <h2 class="text-xs font-black uppercase tracking-[0.3em]">Kernel Process Hierarchy</h2>
           <button class="text-[9px] font-black tracking-widest uppercase text-slate-500 hover:text-white">Refresh_Context</button>
        </div>
        <div class="glass-panel rounded-lg p-6 max-h-[400px] overflow-y-auto">
           <process-tree></process-tree>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
