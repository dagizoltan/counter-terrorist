import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const Dashboard = (props: { status: any; csrfToken: string }) => {
  const { platform } = props.status;
  const metrics = platform?.metrics;

  const islandPaths = [
    '/components/islands/TacticalIntel.js',
    '/components/islands/MetricsHydrator.js',
    '/components/islands/NetworkMap.js',
    '/components/islands/HoneypotChart.js',
    '/components/islands/ReplayIsland.js',
    '/components/islands/EbpfAgent.js'
  ];

  return (
    <Layout title="Command Dashboard" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 1. Header Section */}
      <header class="flex justify-between items-end mb-12 animate-fade-in">
        <div class="flex items-center gap-10">
          <div class="relative">
            <div class="w-4 h-20 bg-primary rounded shadow-primary"></div>
            <div class="absolute inset-0 bg-primary/20 blur-xl animate-pulse"></div>
          </div>
          <div class="flex flex-col gap-3">
            <h1 class="text-7xl font-black text-white tracking-tighter leading-none m-0 uppercase italic skew-x-[-4deg]">Tactical_Overview</h1>
            <div class="flex items-center gap-8">
              <div class="flex items-center gap-3">
                <span class="dot active shadow-primary pulse"></span>
                <span class="mono-xs font-black text-primary tracking-[0.3em] uppercase">MESH_CONSOLIDATED_LINK</span>
              </div>
              <span class="text-slate-800 font-black">//</span>
              <div class="mono-xs font-bold text-slate-500 tracking-[0.3em] uppercase">SOVEREIGN_NODE: {platform?.hostname || "UNKNOWN"}</div>
            </div>
          </div>
        </div>
        <div class="flex gap-6">
          <button class="t-btn py-5 px-8 text-xs shadow-primary/20 group border-2">
            <svg class="mr-3 transition-transform group-hover:rotate-180" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            GLOBAL_SWEEP
          </button>
          <button class="t-btn danger py-5 px-8 text-xs shadow-danger/20 group border-2">
            <svg class="mr-3 group-hover:animate-bounce" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            FORCE_PURGE
          </button>
        </div>
      </header>

      {/* 2. Vital Metrics Grid */}
      <div class="grid grid-cols-12 gap-8 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        {/* Main Hero Metrics */}
        <div class="col-span-12 lg:col-span-4 t-panel glass-panel p-12 border-l-4 border-l-danger group hover:bg-danger/[0.03] transition-all">
          <div class="flex justify-between items-center mb-12">
            <div class="status-pill danger text-[10px] py-1.5 px-5 shadow-danger font-black">Autonomous_Kill_Chain</div>
            <div class="mono-xs font-black text-slate-700 tracking-[0.4em]">ENGAGED</div>
          </div>
          
          <div class="flex items-baseline gap-8 mb-10">
            <span class="text-9xl font-black text-white leading-none tabular-nums tracking-tighter" id="stat-fw-blocked">...</span>
            <div class="flex flex-col">
              <span class="mono-sm font-black text-danger tracking-widest uppercase leading-tight">THREATS</span>
              <span class="mono-sm font-black text-danger tracking-widest uppercase leading-tight">NEUTRALIZED</span>
            </div>
          </div>
          
          <div class="mono-xs font-black text-slate-600 uppercase tracking-[0.3em] mb-12 pb-8 border-b border-white/5">Perimeter_Defense_Active</div>
          
          <div class="space-y-6">
            <div class="flex justify-between items-center bg-black/40 p-5 rounded-lg border border-white/5 group-hover:border-danger/20 transition-all">
              <div class="flex items-center gap-4">
                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                 <span class="mono-xs font-black text-slate-400 uppercase tracking-widest">VPN_SHIELD</span>
              </div>
              <span class="status-pill active py-1.5 px-4" id="stat-vpn-status">WAITING</span>
            </div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-4 t-panel glass-panel p-12 border-l-4 border-l-success group hover:bg-success/[0.03] transition-all">
          <div class="flex justify-between items-center mb-12">
            <div class="status-pill success text-[10px] py-1.5 px-5 shadow-success font-black">Resource_Dynamics</div>
            <div class="mono-xs font-black text-slate-700 tracking-[0.4em]">OPTIMAL</div>
          </div>
          
          <div class="flex items-baseline gap-8 mb-12">
            <span class="text-9xl font-black text-success leading-none tabular-nums tracking-tighter" id="stat-mem-val">
              {Math.floor((metrics?.memory?.used || 0) / 1024 / 1024)}
            </span>
            <div class="flex flex-col">
              <span class="mono-sm font-black text-success tracking-widest uppercase leading-tight">MB</span>
              <span class="mono-sm font-black text-success tracking-widest uppercase leading-tight">ALLOCATED</span>
            </div>
          </div>
          
          <div class="space-y-6">
            <div class="flex justify-between mb-4">
              <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em]">Core_Memory_Load</span>
              <span class="mono-xs font-black text-success tabular-nums">{Math.floor(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100)}%</span>
            </div>
            <div class="h-3 bg-black/60 rounded-full overflow-hidden border border-white/10 shadow-inner">
              <div class="h-full bg-success shadow-success transition-all duration-1000" style={`width:${Math.min(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100, 100)}%`}></div>
            </div>
            <div class="flex justify-between mt-10 pt-8 border-t border-white/5">
               <div class="flex flex-col">
                  <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">UPTIME</span>
                  <span class="mono-xs text-white font-black uppercase tracking-widest mt-1">14D_02H_12M</span>
               </div>
               <div class="flex flex-col text-right">
                  <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">SYSTEM_LOAD</span>
                  <span class="mono-xs text-success font-black uppercase tracking-widest mt-1">STABLE</span>
               </div>
            </div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-4 t-panel glass-panel p-12 border-l-4 border-l-warning group hover:bg-warning/[0.03] transition-all">
          <div class="flex justify-between items-center mb-12">
            <div class="status-pill warning text-[10px] py-1.5 px-5 shadow-warning font-black">Mesh_Quorum</div>
            <div class="mono-xs font-black text-slate-700 tracking-[0.4em]">DISTRIBUTED</div>
          </div>
          
          <div class="flex items-baseline gap-8 mb-12">
            <span class="text-9xl font-black text-warning leading-none tabular-nums tracking-tighter" id="stat-mesh-nodes">...</span>
            <div class="flex flex-col">
              <span class="mono-sm font-black text-warning tracking-widest uppercase leading-tight">ACTIVE</span>
              <span class="mono-sm font-black text-warning tracking-widest uppercase leading-tight">NODES</span>
            </div>
          </div>
          
          <div class="pt-8 border-t border-white/5">
            <span class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] block mb-8">Consensus_Vector_State</span>
            <div class="flex gap-3">
               {[1,1,1,1,1,1,0,0,0,0,0,0].map((v, i) => (
                 <div class="flex-grow h-4 bg-black/60 rounded border border-white/10 relative overflow-hidden">
                    {v ? <div class="absolute inset-0 bg-warning shadow-warning animate-pulse" style={`animation-delay: ${i * 100}ms`}></div> : null}
                 </div>
               ))}
            </div>
            <div class="flex justify-between mt-10">
               <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">Latency: 12ms</span>
               <span class="mono-xs text-warning font-black uppercase tracking-widest animate-pulse">SYNC_LOCKED</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Real-time Analysis Section */}
      <div class="grid grid-cols-12 gap-8 mb-16 animate-fade-in" style="animation-delay: 200ms;">
        <div class="col-span-12 lg:col-span-7 flex flex-col gap-8">
          <div class="t-panel glass-panel p-12 h-full">
            <div class="flex justify-between items-center mb-12 pb-8 border-b border-white/5">
              <div class="flex items-center gap-8">
                <div class="w-2 h-10 bg-primary rounded shadow-primary"></div>
                <h2 class="tactical-title text-2xl uppercase tracking-[0.2em]">AUTOPILOT_SIGNALS</h2>
              </div>
              <div class="flex items-center gap-5 bg-primary/10 px-8 py-4 rounded-full border border-primary/30 shadow-primary/20">
                <span class="dot active shadow-primary animate-pulse"></span>
                <span class="mono-xs font-black text-primary tracking-[0.3em] uppercase">LIVE_INTEL_FEED</span>
              </div>
            </div>
            <div id="tactical-intel-root" class="min-h-[500px]"></div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-5 flex flex-col gap-8">
           <div class="t-panel glass-panel p-10 group border-l-4 border-success">
              <div class="flex justify-between items-center mb-10 pb-6 border-b border-white/5">
                <div class="flex items-center gap-5">
                   <div id="ebpf-status-dot" class="dot active shadow-success"></div>
                   <h3 id="ebpf-status-label" class="tactical-title text-sm tracking-[0.3em] uppercase">Kernel_Guardian</h3>
                </div>
                <span class="mono-xs font-black text-success tracking-widest">REALTIME</span>
              </div>
              
              <div class="grid grid-cols-2 gap-8 mb-10">
                 <div class="bg-black/40 p-6 rounded-lg border border-white/5">
                    <div class="metric-tag mb-2">Intercepts</div>
                    <div id="ebpf-stat-intercepted" class="text-4xl font-black text-white mono tabular-nums">0000</div>
                 </div>
                 <div class="bg-black/40 p-6 rounded-lg border border-white/5">
                    <div class="metric-tag mb-2">Process_Drifts</div>
                    <div id="ebpf-stat-drifts" class="text-4xl font-black text-white mono tabular-nums">00</div>
                 </div>
              </div>

              <div id="ebpf-event-log" class="max-h-[300px] overflow-y-auto custom-scrollbar bg-black/60 rounded-lg border border-white/5">
                 <div class="p-12 text-center opacity-20">
                    <div class="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <span class="mono-xs font-black tracking-widest uppercase">Initializing_Kernel_Stream...</span>
                 </div>
              </div>
              <ebpf-agent></ebpf-agent>
           </div>
        </div>
      </div>

      {/* 4. Forensic Reconstruction Engine */}
      <div class="t-panel glass-panel p-12 mb-16 animate-fade-in" style="animation-delay: 300ms;">
         <div class="flex justify-between items-center mb-12 pb-8 border-b border-white/10">
            <div class="flex items-center gap-8">
               <div class="p-5 bg-warning/10 border border-warning/30 text-warning rounded-lg shadow-warning/20">
                  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
               </div>
               <div>
                  <h2 class="tactical-title text-3xl uppercase tracking-[0.2em]">Forensic_Timeline_Reconstruction</h2>
                  <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.4em] mt-2">Post-mortem audit and causality analysis</p>
               </div>
            </div>
            <div class="flex items-center gap-6">
               <div class="status-pill warning px-6 py-2 shadow-warning font-black">BUFFERED: 500_EVENTS</div>
            </div>
         </div>
         <div id="replay-island-root">
            <div class="p-32 text-center opacity-20">
               <div class="w-16 h-16 border-4 border-slate-700 border-t-transparent rounded-full animate-spin mx-auto mb-8"></div>
               <span class="mono-xs font-black tracking-[0.5em] uppercase">Deploying_Forensic_UI...</span>
            </div>
         </div>
         <script dangerouslySetInnerHTML={{ __html: `
            import { h, render } from '/vendor/preact.js';
            import ReplayIsland from '/components/islands/ReplayIsland.js';
            const root = document.getElementById('replay-island-root');
            if (root) render(h(ReplayIsland), root);
         ` }} />
      </div>
      
      {/* 5. Topology & Deception Row */}
      <div class="grid grid-cols-12 gap-10 animate-fade-in" style="animation-delay: 400ms;">
         <div class="col-span-12 lg:col-span-8 t-panel glass-panel p-12">
            <div class="flex justify-between items-center mb-12 pb-8 border-b border-white/5">
               <div class="flex items-center gap-8">
                  <div class="p-5 bg-primary/10 border border-primary/30 text-primary rounded-lg shadow-primary/20">
                     <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                  </div>
                  <div>
                     <h2 class="tactical-title text-2xl uppercase tracking-widest">MESH_TOPOLOGY_VECTOR</h2>
                     <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.3em] mt-1">Real-time node discovery and geometric propagation</p>
                  </div>
               </div>
               <div class="flex items-center gap-5 bg-black/60 border border-white/10 px-8 py-4 rounded-full shadow-inner">
                  <span class="dot active shadow-primary pulse"></span>
                  <span class="mono-xs font-black text-primary tracking-[0.3em] uppercase">SYSTEM_SWEEP</span>
               </div>
            </div>
            <div class="bg-black/60 rounded-xl p-16 border border-white/5 min-h-[600px] relative overflow-hidden group shadow-2xl">
               <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none duration-700"></div>
               <div class="absolute inset-0 pointer-events-none opacity-30" style="background-image: radial-gradient(var(--primary) 1.5px, transparent 1.5px); background-size: 40px 40px;"></div>
               <div class="animate-scan-y opacity-30"></div>
               <network-map></network-map>
            </div>
         </div>

         <div class="col-span-12 lg:col-span-4 t-panel glass-panel p-12 flex flex-col">
            <div class="flex justify-between items-center mb-12 pb-8 border-b border-white/5">
               <h2 class="tactical-title text-2xl uppercase tracking-widest">DECEPTION_GRID</h2>
               <div class="status-pill active shadow-success animate-pulse px-6 py-2 font-black">STRIKE_BACK_READY</div>
            </div>
            <div class="flex-grow flex items-center justify-center p-10 bg-black/60 rounded-xl border border-white/10 shadow-inner group">
               <div class="relative w-full h-full flex items-center justify-center">
                  <div class="absolute inset-0 bg-primary/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <honeypot-chart></honeypot-chart>
               </div>
            </div>
            <div class="mt-12 pt-10 border-t border-white/5">
               <div class="flex items-center gap-5 mb-8">
                  <div class="w-16 h-1.5 bg-primary rounded shadow-primary"></div>
                  <span class="mono-xs text-slate-600 font-black uppercase tracking-[0.4em]">DECEPTION_MANIFEST</span>
               </div>
               <div class="space-y-6">
                 <p class="mono-xs text-slate-400 font-bold leading-relaxed uppercase tracking-widest">
                   MONITORING: <span class="text-white">12_DISTRIBUTED_LURES</span> <br/> 
                   ACTIVE_SPOOF: <br/> 
                   <span class="text-primary bg-primary/10 p-4 rounded-lg inline-block mt-4 border border-primary/30 shadow-primary/20 font-black tracking-widest w-full text-center">
                     [OP_SSH_9.2_MIMICRY]
                   </span>
                 </p>
                 <button class="t-btn w-full justify-center py-4 uppercase font-black tracking-widest text-[10px]">ROTATE_DECEPTION_KEYS</button>
               </div>
            </div>
         </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
