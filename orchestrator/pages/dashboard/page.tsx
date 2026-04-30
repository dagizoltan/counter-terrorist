/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

import { ApplicationStatus } from "../../core/ports.ts";

export const Dashboard = (props: { status: ApplicationStatus }) => {
  const { os, platformTag, isRoot, plugins } = props.status;
  
  const cssPaths = ['/pages/dashboard/style.css'];
  const islandPaths = [
    '/pages/dashboard/islands/StatusIndicator.js',
    '/pages/dashboard/islands/BlockingLog.js',
    '/pages/dashboard/islands/ProcessTree.js',
    '/pages/dashboard/islands/HoneypotChart.js'
  ];

  return (
    <Layout title="Dashboard" cssPaths={cssPaths} islandPaths={islandPaths}>
      {/* Top Header Section */}
      <div class="flex justify-between items-end mb-12">
        <div>
          <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Security Console</h2>
          <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Node status: <span class="text-green-500">Encrypted</span> // Latency: 4ms</p>
        </div>
        <div class="flex gap-4">
          <button class="bg-white text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Export Report</button>
          <button class="border border-white/20 px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Emergency Lockdown</button>
        </div>
      </div>

      {/* Metrics Row */}
      <div class="grid grid-cols-1 xl:grid-cols-4 gap-8 mb-8">
        <div class="bg-white/5 p-8 border-l-2 border-red-600">
          <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Core System</h3>
          <p class="text-2xl font-bold uppercase tracking-tight">{os}</p>
        </div>

        <div class="bg-white/5 p-8 border-l-2 border-slate-700">
          <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Privileges</h3>
          <p class={`text-2xl font-bold uppercase tracking-tight ${isRoot ? "text-white" : "text-yellow-500"}`}>
            {isRoot ? "Elevated" : "Limited"}
          </p>
        </div>

        <div class="xl:col-span-2 bg-white/5 p-8 border-l-2 border-slate-700 relative overflow-hidden">
          <h3 class="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-4">Threat Detection Trend</h3>
           <honeypot-chart></honeypot-chart>
        </div>
      </div>

      {/* PROCESS HIERARCHY FULL WIDTH */}
      <section class="bg-white/5 mb-8">
        <div class="p-8 pb-4 border-b border-white/5 flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-[0.3em]">Kernel Process Hierarchy</h2>
          <button onclick="document.querySelector('process-tree').refresh()" class="text-[9px] font-black tracking-widest uppercase text-slate-500 hover:text-white">FORCE_REFRESH</button>
        </div>
        <div class="p-8 max-h-[400px] overflow-y-auto bg-black/20">
          <process-tree></process-tree>
        </div>
      </section>

      {/* REAL-TIME LOG FULL WIDTH */}
      <section class="bg-white/5 mb-12">
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

      {/* CONTROLS SECTION BELOW */}
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Protection Matrix */}
        <section class="lg:col-span-2 bg-white/5 p-8">
          <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
             <h2 class="text-xs font-black uppercase tracking-[0.3em]">System Hardening Matrix</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div class="p-6 bg-black/40 border border-white/5">
                <p class="text-slate-500 text-[9px] font-bold uppercase mb-2">Firewall Enforcer</p>
                <div class="flex justify-between items-center">
                  <span class="text-xs font-bold uppercase">Locked</span>
                  <div class="w-1.5 h-1.5 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                </div>
              </div>
              <div class="p-6 bg-black/40 border border-white/5 opacity-50">
                <p class="text-slate-500 text-[9px] font-bold uppercase mb-2">Traffic Obfuscation</p>
                <div class="flex justify-between items-center">
                  <span class="text-xs font-bold uppercase">Idle</span>
                  <div class="w-1.5 h-1.5 bg-slate-800"></div>
                </div>
              </div>
              <div class="p-6 bg-black/40 border border-white/5">
                <p class="text-slate-500 text-[9px] font-bold uppercase mb-2">Audit Subsystem</p>
                <div class="flex justify-between items-center">
                   <span class="text-xs font-bold uppercase">Verified</span>
                  <div class="w-1.5 h-1.5 bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                </div>
              </div>
          </div>
        </section>

        {/* Plugins Sidebar */}
        <section class="bg-white/5 p-8">
           <div class="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
              <h2 class="text-xs font-black uppercase tracking-[0.3em]">Loaded Agents</h2>
              <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{plugins?.length || 0} ACTIVE</span>
           </div>
           <div class="space-y-1">
              {plugins?.map(p => (
                <div class="flex items-center justify-between p-3 bg-black/20 border border-white/5 hover:border-white/10 transition-all group">
                  <span class="text-[10px] font-medium uppercase tracking-widest text-slate-400 group-hover:text-white transition-colors">{p.name}</span>
                  <div class={`w-1 h-1 ${p.status === 'ACTIVE' || p.status === 'RUNNING' ? 'bg-green-500' : 'bg-red-600 shadow-[0_0_5px_rgba(239,68,68,0.5)]'}`}></div>
                </div>
              ))}
           </div>
        </section>
      </div>
    </Layout>
  );
};
