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
    '/components/islands/EbpfAgent.js',
    '/components/islands/NewsFeed.js'
  ];

  return (
    <Layout title="Command Dashboard" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Tactical Dashboard</h1>
          <span class="subtitle">Operational Node: {platform?.hostname || "localhost"} // v4.2.0-stable</span>
        </div>
        <div class="flex gap-4">
          <button class="t-btn px-6 py-3 group">
            <svg class="transition-transform group-hover:rotate-180" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            System_Sweep
          </button>
          <button class="t-btn danger px-6 py-3 group" onclick="confirm('CRITICAL: FORCE_PURGE will terminate all active processes. PROCEED?')">
            <svg class="group-hover:animate-bounce" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            Force_Purge
          </button>
        </div>
      </header>

      {/* 2. Unified Stat Cards */}
      <div class="grid grid-cols-12 gap-10 mb-16">
        <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 border-primary group">
          <div class="flex justify-between items-center mb-4">
            <span class="label">Defense Intelligence</span>
            <div class="flex items-center gap-2">
              <span class="dot active shadow-primary pulse"></span>
              <span class="mono-xs text-primary font-black uppercase tracking-widest">Active</span>
            </div>
          </div>
          <div class="value-group">
            <span class="value tabular-nums" id="stat-fw-blocked">0</span>
            <span class="unit">Threats Neutralized</span>
          </div>
          <div class="footer flex justify-between items-center mt-6 pt-6 border-t border-white/5">
            <span class="mono-xs text-slate-500 font-bold uppercase tracking-[0.2em]">Shield_Active</span>
            <span class="status-pill success pulse" id="stat-vpn-status">WAITING</span>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 border-success group">
          <div class="flex justify-between items-center mb-4">
            <span class="label">Memory Utilization</span>
            <div class="flex items-center gap-2">
              <span class="dot active shadow-success"></span>
              <span class="mono-xs text-success font-black uppercase tracking-widest">Stable</span>
            </div>
          </div>
          <div class="value-group">
            <span class="value tabular-nums" id="stat-mem-val">{Math.floor((metrics?.memory?.used || 0) / 1024 / 1024)}</span>
            <span class="unit">MB Allocated</span>
          </div>
          <div class="footer mt-6 pt-6 border-t border-white/5">
            <div class="flex justify-between mb-4">
              <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Load: {Math.floor(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100)}%</span>
              <span class="mono-xs text-slate-500 font-bold uppercase tracking-widest">Uptime: {Math.floor(platform?.uptime / 3600) || 0}H</span>
            </div>
            <div class="h-2 bg-black/40 rounded-full overflow-hidden shadow-inner border border-white/5">
              <div class="h-full bg-success shadow-success transition-all duration-700" style={`width:${Math.min(((metrics?.memory?.used || 0) / (metrics?.memory?.total || 1)) * 100, 100)}%`}></div>
            </div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 border-warning group">
          <div class="flex justify-between items-center mb-4">
            <span class="label">Mesh Network Quorum</span>
            <div class="flex items-center gap-2">
              <span class="dot warning shadow-warning animate-pulse"></span>
              <span class="mono-xs text-warning font-black uppercase tracking-widest">Syncing</span>
            </div>
          </div>
          <div class="value-group">
            <span class="value tabular-nums" id="stat-mesh-nodes">0</span>
            <span class="unit">Nodes Active</span>
          </div>
          <div class="footer flex justify-between items-center mt-6 pt-6 border-t border-white/5">
            <span class="mono-xs text-slate-500 font-bold uppercase tracking-[0.2em]">Topology: Mesh</span>
            <span class="mono-xs text-warning font-black animate-pulse tracking-widest">SYNC_IN_PROGRESS</span>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 border-primary group">
          <div class="flex justify-between items-center mb-4">
            <span class="label">Autonomous Governance</span>
            <div class="flex items-center gap-2">
              <span class="dot active shadow-primary"></span>
              <span class="mono-xs text-primary font-black uppercase tracking-widest" id="stat-policy-mode">ADAPTIVE</span>
            </div>
          </div>
          <div class="value-group">
            <span class="value tabular-nums" id="stat-policy-remediations">0</span>
            <span class="unit">Auto Remediation</span>
          </div>
          <div class="footer flex justify-between items-center mt-6 pt-6 border-t border-white/5">
            <span class="mono-xs text-slate-500 font-bold uppercase tracking-[0.2em]">Policy: v1.2.0</span>
            <span class="status-pill success pulse" id="stat-policy-status">ENFORCING</span>
          </div>
        </div>
      </div>

      {/* 3. Real-time Analysis Section */}
      <div class="grid grid-cols-12 gap-10 mb-20 animate-fade-in" style="animation-delay: 200ms;">
        <div class="col-span-12 lg:col-span-7 flex flex-col gap-10">
          <div class="t-panel glass-panel relative group h-full">
            <div class="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-30 transition-opacity">
               <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="text-primary"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div class="flex justify-between items-center mb-16 pb-10 border-b border-white/5">
              <div class="flex items-center gap-10">
                <div class="w-2.5 h-12 bg-primary rounded-full shadow-primary"></div>
                <h2 class="tactical-title text-3xl tracking-[0.3em]">AUTOPILOT_SIGNALS</h2>
              </div>
              <div class="flex items-center gap-6 bg-primary/10 px-10 py-5 rounded-full border border-primary/20 shadow-primary/10">
                <span class="dot active shadow-primary"></span>
                <span class="status-pill primary border-none bg-transparent p-0">LIVE_INTEL_FEED</span>
              </div>
            </div>
            <div id="tactical-intel-root" class="min-h-[600px]"></div>
          </div>
        </div>

        <div class="col-span-12 lg:col-span-5 flex flex-col gap-10">
           <div class="t-panel glass-panel p-12 group border-l-4 border-success h-full flex flex-col">
              <div class="flex justify-between items-center mb-12 pb-8 border-b border-white/5">
                <div class="flex items-center gap-6">
                   <div id="ebpf-status-dot" class="dot active shadow-success"></div>
                   <h3 id="ebpf-status-label" class="tactical-title text-base tracking-[0.3em] uppercase">Kernel_Guardian</h3>
                </div>
                <span class="mono-xs font-black text-success tracking-[0.2em] uppercase">REALTIME_FUSION</span>
              </div>
              
              <div class="grid grid-cols-2 gap-10 mb-12">
                 <div class="bg-black/30 p-8 rounded-xl border border-white/5 shadow-inner">
                    <div class="metric-tag mb-3 font-black">Intercepts</div>
                    <div id="ebpf-stat-intercepted" class="text-5xl font-black text-white mono tabular-nums tracking-tighter">0000</div>
                 </div>
                 <div class="bg-black/30 p-8 rounded-xl border border-white/5 shadow-inner">
                    <div class="metric-tag mb-3 font-black">Process_Drifts</div>
                    <div id="ebpf-stat-drifts" class="text-5xl font-black text-white mono tabular-nums tracking-tighter">00</div>
                 </div>
              </div>

              <div id="ebpf-event-log" class="flex-grow overflow-y-auto custom-scrollbar bg-black/50 rounded-xl border border-white/5 p-8">
                 <div class="flex flex-col items-center justify-center h-full gap-8">
                    <div class="skeleton h-12 w-full"></div>
                    <div class="skeleton h-12 w-full opacity-60"></div>
                    <div class="skeleton h-12 w-full opacity-30"></div>
                 </div>
              </div>
              <ebpf-agent></ebpf-agent>
           </div>
        </div>
      </div>

      {/* 4. Forensic Reconstruction Engine */}
      <div class="t-panel glass-panel mb-20 animate-fade-in group" style="animation-delay: 300ms;">
         <div class="flex justify-between items-center mb-16 pb-10 border-b border-white/10">
            <div class="flex items-center gap-10">
               <div class="p-6 bg-warning/10 border border-warning/30 text-warning rounded-xl shadow-warning/20 group-hover:scale-110 transition-transform duration-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
               </div>
               <div>
                  <h2 class="tactical-title text-4xl tracking-[0.25em]">Forensic_Timeline</h2>
                  <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.4em] mt-3">Post-mortem audit and causality analysis engine</p>
               </div>
            </div>
            <div class="flex items-center gap-8">
               <div class="status-pill warning pulse">BUFFERED: 500_EVENTS</div>
            </div>
         </div>
          <div id="replay-island-root">
             <div class="flex flex-col gap-8">
                <div class="skeleton h-64 w-full"></div>
                <div class="grid grid-cols-12 gap-8">
                   <div class="col-span-8 skeleton h-[400px]"></div>
                   <div class="col-span-4 skeleton h-[400px]"></div>
                </div>
             </div>
          </div>
         <script type="module" dangerouslySetInnerHTML={{ __html: `
            import { h, render } from '/vendor/preact.js';
            import ReplayIsland from '/components/islands/ReplayIsland.js';
            const root = document.getElementById('replay-island-root');
            if (root) {
              root.innerHTML = '';
              render(h(ReplayIsland), root);
            }
         ` }} />
      </div>
      
      {/* 5. Topology & Deception Row */}
      <div class="grid grid-cols-12 gap-10 animate-fade-in" style="animation-delay: 400ms;">
        <div class="col-span-12 lg:col-span-8 t-panel glass-panel relative group">
            <div class="flex justify-between items-center mb-16 pb-10 border-b border-white/5">
               <div class="flex items-center gap-10">
                  <div class="p-6 bg-primary/10 border border-primary/30 text-primary rounded-xl shadow-primary/20 group-hover:rotate-12 transition-transform duration-500">
                     <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                  </div>
                  <div>
                     <h2 class="tactical-title text-3xl tracking-widest">MESH_TOPOLOGY</h2>
                     <p class="mono-xs text-slate-500 font-bold uppercase tracking-[0.4em] mt-2">Real-time node discovery and geometric propagation</p>
                  </div>
               </div>
               <div class="flex items-center gap-6 bg-black/60 border border-white/10 px-10 py-5 rounded-full shadow-inner">
                  <span class="dot active shadow-primary pulse"></span>
                  <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">SYSTEM_SWEEP</span>
               </div>
            </div>
            <div class="bg-black/40 rounded-2xl p-10 border border-white/5 min-h-[700px] relative overflow-hidden group shadow-2xl">
               <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none duration-1000"></div>
               <div class="absolute inset-0 pointer-events-none opacity-[0.15]" style="background-image: radial-gradient(var(--primary) 1.5px, transparent 1.5px); background-size: 50px 50px;"></div>
               <div class="animate-scan-y opacity-40"></div>
               <network-map></network-map>
            </div>
         </div>

         <div class="col-span-12 lg:col-span-4 t-panel glass-panel group h-full">
            <div class="flex justify-between items-center mb-16 pb-10 border-b border-white/5">
               <h2 class="tactical-title text-3xl tracking-widest">DECEPTION_GRID</h2>
               <div class="status-pill success pulse">STRIKE_BACK</div>
            </div>
            <div class="flex-grow flex items-center justify-center p-12 bg-black/40 rounded-2xl border border-white/10 shadow-inner group-hover:border-primary/20 transition-colors relative">
               <div class="absolute inset-0 bg-primary/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
               <honeypot-chart></honeypot-chart>
            </div>
            <div class="mt-16 pt-12 border-t border-white/5">
               <div class="flex items-center gap-6 mb-10">
                  <div class="w-20 h-2 bg-primary rounded-full shadow-primary"></div>
                  <span class="mono-xs text-slate-500 font-black uppercase tracking-[0.5em]">Tactical_Signal_Feed</span>
               </div>
               <news-feed></news-feed>
            </div>
         </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
