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
    '/pages/dashboard/islands/HoneypotChart.js',
    '/pages/dashboard/islands/MeshGraph.js',
    '/pages/dashboard/islands/ThreatMap.js',
    '/pages/dashboard/islands/MetricsHydrator.js'
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
          <a href="/api/forensics/export" class="bg-white text-black px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center">Export Report</a>
          <a href="/api/forensics/export-iac" class="border border-white/20 text-white px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all flex items-center justify-center">Clone Posture</a>
          <button 
            onclick="fetch('/api/protection/lockdown', { method: 'POST' }).then(r => r.json()).then(d => alert(d.stdout))"
            class="border border-white/20 px-6 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all text-red-500"
          >
            Lockdown
          </button>
        </div>
      </div>

      {/* ROW 1: CORE TELEMETRY */}
      <div class="grid grid-cols-1 xl:grid-cols-4 gap-8 mb-8">
        <div class="xl:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-6">
           <div class="bg-white/5 p-6 border-l-2 border-red-600">
             <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">OS Context</h3>
             <p class="text-xl font-bold uppercase tracking-tight">{os} {platform?.version}</p>
           </div>
           <div class="bg-white/5 p-6 border-l-2 border-slate-700">
             <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">System Load</h3>
             <p class="text-xl font-bold uppercase tracking-tight">{metrics?.cpu.load[0].toFixed(2)}</p>
           </div>
           <div class="bg-white/5 p-6 border-l-2 border-slate-700">
             <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-2">Memory Utilization</h3>
             <p class="text-xl font-bold uppercase tracking-tight">{formatBytes(metrics?.memory.used)}</p>
           </div>
        </div>
        <div class="bg-white/5 p-6 border-l-2 border-slate-700 relative overflow-hidden flex flex-col justify-center">
          <h3 class="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-4">Mesh Topology</h3>
          <div class="h-24">
            <mesh-graph></mesh-graph>
          </div>
        </div>
      </div>

      {/* ROW 2: PROTECTION AGENTS */}
      <div class="mb-8">
         <div class="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
            <h2 class="text-xs font-black uppercase tracking-[0.3em]">Protection Layer</h2>
            <span id="stat-protection-count" class="text-[9px] font-bold text-slate-500 uppercase">...</span>
         </div>
         <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white/5 p-6 border border-white/5 hover:border-white/10 transition-all">
               <div class="flex justify-between items-start mb-4">
                  <span class="text-[10px] font-black uppercase tracking-widest">Firewall_Enforcer</span>
                  <div class="w-2 h-2 bg-green-500"></div>
               </div>
               <div class="space-y-2">
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Blocked IPs</span>
                     <span id="stat-fw-blocked" class="text-white">...</span>
                  </div>
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Active Rules</span>
                     <span id="stat-fw-rules" class="text-white">...</span>
                  </div>
               </div>
               <a href="/agents/firewall" class="mt-4 block text-center py-2 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Details</a>
            </div>

            <div class="bg-white/5 p-6 border border-white/5 hover:border-white/10 transition-all">
               <div class="flex justify-between items-start mb-4">
                  <span class="text-[10px] font-black uppercase tracking-widest">VPN_Sentinel</span>
                  <div class="w-2 h-2 bg-green-500"></div>
               </div>
               <div class="space-y-2">
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Mesh Peers</span>
                     <span id="stat-mesh-nodes" class="text-white">...</span>
                  </div>
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Verified</span>
                     <span id="stat-mesh-handshakes" class="text-white">...</span>
                  </div>
               </div>
               <a href="/agents/vpn" class="mt-4 block text-center py-2 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Details</a>
            </div>

            <div class="bg-white/5 p-6 border border-white/5 hover:border-white/10 transition-all">
               <div class="flex justify-between items-start mb-4">
                  <span class="text-[10px] font-black uppercase tracking-widest">Vuln_Scanner</span>
                  <div class="w-2 h-2 bg-slate-600"></div>
               </div>
               <div class="space-y-2">
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Last Scan</span>
                     <span id="stat-scanner-last" class="text-white">...</span>
                  </div>
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Result</span>
                     <span id="stat-scanner-result" class="text-white">...</span>
                  </div>
               </div>
               <a href="/agents/scanner" class="mt-4 block text-center py-2 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Details</a>
            </div>
         </div>
      </div>

      {/* ROW 3: FORENSIC AGENTS */}
      <div class="mb-12">
         <div class="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
            <h2 class="text-xs font-black uppercase tracking-[0.3em]">Forensic Ops</h2>
            <span id="stat-forensic-count" class="text-[9px] font-bold text-slate-500 uppercase">...</span>
         </div>
         <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="bg-white/5 p-6 border border-white/5 hover:border-white/10 transition-all border-l-2 border-yellow-500">
               <div class="flex justify-between items-start mb-4">
                  <span class="text-[10px] font-black uppercase tracking-widest">eBPF_Observer</span>
                  <div class="w-2 h-2 bg-red-600 animate-pulse"></div>
               </div>
               <div class="space-y-2">
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Processes</span>
                     <span id="stat-forensics-procs" class="text-white">...</span>
                  </div>
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Status</span>
                     <span id="stat-forensics-ebpf-status" class="text-white">...</span>
                  </div>
               </div>
               <a href="/agents/ebpf" class="mt-4 block text-center py-2 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Monitor</a>
            </div>

            <div class="bg-white/5 p-6 border border-white/5 hover:border-white/10 transition-all">
               <div class="flex justify-between items-start mb-4">
                  <span class="text-[10px] font-black uppercase tracking-widest">FIM_Warden</span>
                  <div class="w-2 h-2 bg-green-500"></div>
               </div>
               <div class="space-y-2">
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Status</span>
                     <span id="stat-forensics-fim-status" class="text-white">...</span>
                  </div>
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Canary Tokens</span>
                     <span id="stat-canary-deployed" class="text-white">...</span>
                  </div>
               </div>
               <a href="/agents/fim" class="mt-4 block text-center py-2 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Monitor</a>
            </div>

            <div class="bg-white/5 p-6 border border-white/5 hover:border-white/10 transition-all">
               <div class="flex justify-between items-start mb-4">
                  <span class="text-[10px] font-black uppercase tracking-widest">Deception_Grid</span>
                  <div class="w-2 h-2 bg-green-500"></div>
               </div>
               <div class="space-y-2">
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Active Decoys</span>
                     <span id="stat-honeypot-active" class="text-white">...</span>
                  </div>
                  <div class="flex justify-between text-[9px] uppercase font-bold text-slate-500">
                     <span>Total Hits</span>
                     <span id="stat-honeypot-hits" class="text-white">...</span>
                  </div>
               </div>
               <a href="/honeypots" class="mt-4 block text-center py-2 border border-white/10 text-[8px] font-black uppercase tracking-widest hover:bg-white/5 transition-all">Grid_View</a>
            </div>
         </div>
      </div>

      {/* ROW 4: HARDENING MATRIX — all values hydrated from real sysctl */}
      <div class="mb-12">
         <div class="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
            <h2 class="text-xs font-black uppercase tracking-[0.3em]">Hardening Matrix</h2>
            <span id="stat-audit-chain" class="text-[9px] font-bold text-green-500 uppercase tracking-widest font-mono">...</span>
         </div>
         <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div class="bg-white/5 p-4 border border-white/5 text-center">
               <p class="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">ASLR</p>
               <p id="stat-kernel-aslr" class="text-[10px] font-black uppercase text-slate-500">...</p>
            </div>
            <div class="bg-white/5 p-4 border border-white/5 text-center">
               <p class="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">SYN_COOKIES</p>
               <p id="stat-kernel-syncookies" class="text-[10px] font-black uppercase text-slate-500">...</p>
            </div>
            <div class="bg-white/5 p-4 border border-white/5 text-center">
               <p class="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">RP_FILTER</p>
               <p id="stat-kernel-rpfilter" class="text-[10px] font-black uppercase text-slate-500">...</p>
            </div>
            <div class="bg-white/5 p-4 border border-white/5 text-center">
               <p class="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">CANARIES</p>
               <p id="stat-canary-triggered" class="text-[10px] font-black uppercase text-slate-500">...</p>
            </div>
            <div class="bg-white/5 p-4 border border-white/5 text-center">
               <p class="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">P2P_RBAC</p>
               <p class="text-[10px] font-black uppercase text-blue-500">ENFORCED</p>
            </div>
            <div class="bg-white/5 p-4 border border-white/5 text-center">
               <p class="text-slate-500 text-[8px] font-black uppercase tracking-widest mb-1">AUDIT_CHAIN</p>
               <p id="stat-audit-chain" class="text-[10px] font-black uppercase text-slate-500">...</p>
            </div>
         </div>
      </div>

      {/* ROW 5: THREAT GEOGRAPHY */}
      <div class="mb-12">
         <div class="flex justify-between items-center mb-6 pb-2 border-b border-white/5">
            <h2 class="text-xs font-black uppercase tracking-[0.3em]">Global Threat Geography</h2>
            <a href="/intel/map" class="text-[9px] font-bold text-slate-500 uppercase hover:text-white transition-all tracking-widest">Standalone Map →</a>
         </div>
         <div class="h-96 bg-black relative border border-white/5 overflow-hidden">
            <threat-map></threat-map>
         </div>
      </div>

      {/* REAL-TIME LOG */}
      <section class="bg-white/5 border border-white/5 mb-12">
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
      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
