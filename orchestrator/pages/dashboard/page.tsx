/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

import { ApplicationStatus } from "../../core/ports.ts";

export const Dashboard = (props: { status: ApplicationStatus }) => {
  const { os, isRoot, platform, plugins } = props.status;
  const metrics = platform?.metrics;

  const cssPaths = ['/pages/dashboard/style.css'];
  const islandPaths = [
    '/pages/dashboard/islands/StatusIndicator.js',
    '/pages/dashboard/islands/BlockingLog.js',
    '/pages/dashboard/islands/ProcessTree.js',
    '/pages/dashboard/islands/HoneypotChart.js'
  ];

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout title="Dashboard" cssPaths={cssPaths} islandPaths={islandPaths}>
      {/* Top Header Section */}
      <div class="flex justify-between items-end mb-8">
        <div>
          <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Security Console</h2>
          <p class="text-slate-500 text-[10px] font-medium tracking-widest uppercase">
            HOST: <span class="text-white">{metrics?.hostname || "LOCALHOST"}</span> // 
            UPTIME: <span class="text-white">{Math.floor((metrics?.uptime || 0) / 3600)}H {Math.floor(((metrics?.uptime || 0) % 3600) / 60)}M</span>
          </p>
        </div>
        <div class="flex gap-4">
          <button class="bg-white text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Export Report</button>
          <button 
            onclick="fetch('/api/protection/lockdown', { method: 'POST' }).then(r => r.json()).then(d => alert(d.stdout))"
            class="border border-white/20 px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all text-red-500"
          >
            Lockdown
          </button>
        </div>
      </div>

      {/* Metrics Row - Compact */}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <div class="bg-white/5 p-6 border-l-2 border-red-600">
          <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Core System</h3>
          <p class="text-xl font-bold uppercase tracking-tight">{os} {platform?.version}</p>
        </div>

        <div class="bg-white/5 p-6 border-l-2 border-slate-700">
          <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Memory</h3>
          <p class="text-xl font-bold uppercase tracking-tight">{formatBytes(metrics?.memory.used)}</p>
          <div class="w-full bg-white/5 h-1 mt-3">
             <div class="bg-white h-full" style={`width: ${((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100}%`}></div>
          </div>
        </div>

        <div class="bg-white/5 p-6 border-l-2 border-slate-700">
          <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">CPU Load</h3>
          <p class="text-xl font-bold uppercase tracking-tight">{metrics?.cpu.load[0].toFixed(2)}</p>
        </div>

        <div class="bg-white/5 p-6 border-l-2 border-slate-700 relative overflow-hidden">
          <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Detection Trend</h3>
           <div class="h-8">
             <honeypot-chart></honeypot-chart>
           </div>
        </div>
      </div>

      {/* AGENTS & HARDENING ROW */}
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <section class="bg-white/5 p-8 border border-white/5">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <a href="/agents" class="text-xs font-black uppercase tracking-[0.3em] hover:text-white transition-all">Protection Agents →</a>
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{plugins?.length || 0} ACTIVE</span>
           </div>
           <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plugins?.map(p => (
                <div class="p-4 bg-black/40 border border-white/5 hover:border-white/20 transition-all flex justify-between items-center group/card">
                  <div>
                    <span class="text-[10px] font-black uppercase tracking-widest block mb-1">{p.name}</span>
                    <div class="flex items-center gap-2">
                       <div class={`w-1 h-1 ${p.status === 'ACTIVE' || p.status === 'RUNNING' ? 'bg-green-500' : 'bg-red-600'}`}></div>
                       <span class="text-[8px] text-slate-500 font-bold uppercase">{p.status}</span>
                    </div>
                  </div>
                  <a href={`/agents/${p.name}`} class="opacity-0 group-hover/card:opacity-100 transition-all p-2 hover:bg-white/5 text-slate-400 hover:text-white">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/></svg>
                  </a>
                </div>
              ))}
           </div>
        </section>

        <section class="bg-white/5 p-8 border border-white/5">
          <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
             <h2 class="text-xs font-black uppercase tracking-[0.3em]">Hardening Matrix</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="p-4 bg-black/40 border border-white/5">
                <p class="text-slate-500 text-[9px] font-bold uppercase mb-2">Firewall Enforcer</p>
                <div class="flex justify-between items-center">
                  <span class="text-xs font-bold uppercase">{isRoot ? "Kernel Mode" : "User Mode"}</span>
                  <div class="w-1.5 h-1.5 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                </div>
              </div>
              <div class="p-4 bg-black/40 border border-white/5">
                <p class="text-slate-500 text-[9px] font-bold uppercase mb-2">Audit Subsystem</p>
                <div class="flex justify-between items-center">
                   <span class="text-xs font-bold uppercase">{props.status.auditVerified ? "Chain Verified" : "INTEGRITY_FAIL"}</span>
                  <div class={`w-1.5 h-1.5 ${props.status.auditVerified ? "bg-green-500" : "bg-red-600 animate-pulse"}`}></div>
                </div>
              </div>
          </div>
        </section>
      </div>

      {/* REAL-TIME LOG FULL WIDTH */}
      <section class="bg-white/5 mb-8 border border-white/5">
        <div class="p-8 pb-4 border-b border-white/5 flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-[0.3em]">Security Event Stream</h2>
          <div class="flex gap-4 items-center">
            <span class="text-[9px] text-slate-500 tracking-widest uppercase">Live Feed</span>
            <div class="w-1.5 h-1.5 bg-red-600 animate-pulse"></div>
          </div>
        </div>
        <div class="p-0">
          <blocking-log id="main-log"></blocking-log>
        </div>
      </section>

      {/* PROCESS HIERARCHY FULL WIDTH */}
      <section class="bg-white/5 border border-white/5">
        <div class="p-8 pb-4 border-b border-white/5 flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-[0.3em]">Kernel Process Hierarchy</h2>
          <button onclick="document.querySelector('process-tree').refresh()" class="text-[9px] font-black tracking-widest uppercase text-slate-500 hover:text-white">FORCE_REFRESH</button>
        </div>
        <div class="p-8 max-h-[400px] overflow-y-auto bg-black/20">
          <process-tree></process-tree>
        </div>
      </section>
    </Layout>
  );
};
