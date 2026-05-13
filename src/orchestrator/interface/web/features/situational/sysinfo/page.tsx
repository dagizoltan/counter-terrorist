import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * System Information Page
 * Hardware and OS deep-dive with high-fidelity tactical grid.
 * Refined for high-readability and zero-underscore policy.
 */
export const SysInfoPage = (props: { status: ApplicationStatus, csrfToken?: string, nonce?: string }) => {
  const { platform } = props.status;
  const metrics = platform?.metrics;

  const formatBytes = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout nonce={props.nonce} title="Infrastructure Hub // Sovereign Overwatch" islandPaths={['/components/islands/SystemHealth.js']} csrfToken={props.csrfToken} >
      
      {/* 01 Unified Page Header */}
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Infrastructure Hub</h1>
          <span class="subtitle">Hardware Topology & OS Integrity Mapping // v4.2.0-STABLE</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-6 bg-primary/10 border border-primary/20 px-10 py-5 rounded-full backdrop-blur-xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]">
              <span class="dot active"></span>
              <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Telemetry Live</span>
           </div>
        </div>
      </header>

      {/* 02 Platform Architecture */}
      <div class="grid grid-cols-12 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Hardware Specs */}
        <section class="col-span-12 lg:col-span-6 t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-700 group transition-all hover:bg-white/[0.02]">
           <header class="p-8 border-b border-white/10 flex items-center gap-6 bg-black/40 backdrop-blur-md">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-2xl shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
              </div>
              <div class="flex flex-col gap-2">
                 <h3 class="tactical-title text-2xl tracking-widest uppercase">Hardware Specification</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Physical layer audit & inventory</p>
              </div>
           </header>
           
           <div class="p-10 flex flex-col gap-5 bg-black/20">
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">System Hostname</span>
                 <span class="text-3xl font-black text-white tracking-tighter uppercase italic">{metrics?.hostname}</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Processor Cores</span>
                 <span class="text-3xl font-black text-white tracking-tighter uppercase">{metrics?.cpu.cores} Threads</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Physical Memory</span>
                 <span class="text-3xl font-black text-white tracking-tighter uppercase">{formatBytes(metrics?.memory.total)}</span>
              </div>
              <div class="flex justify-between items-center p-10 bg-primary/5 border border-primary/20 rounded-2xl shadow-[inset_0_0_20px_rgba(var(--primary-rgb),0.05)]">
                 <span class="mono-xs text-primary font-black uppercase tracking-widest">Architecture</span>
                 <span class="text-3xl font-black text-primary tracking-tighter uppercase">{Deno.build.arch}</span>
              </div>
           </div>
        </section>

        {/* OS & Environment */}
        <section class="col-span-12 lg:col-span-6 t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-700 group transition-all hover:bg-white/[0.02]">
           <header class="p-8 border-b border-white/10 flex items-center gap-6 bg-black/40 backdrop-blur-md">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-2xl shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div class="flex flex-col gap-2">
                 <h3 class="tactical-title text-2xl tracking-widest uppercase">Software Environment</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em]">Sovereign runtime & kernel state</p>
              </div>
           </header>

           <div class="p-10 flex flex-col gap-6 bg-black/20">
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">OS Distribution</span>
                 <span class="text-3xl font-black text-white tracking-tighter uppercase">{platform?.name} {platform?.version}</span>
              </div>
              <div class="flex flex-col gap-4 p-8 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Kernel Build Tag</span>
                 <span class="mono-xs text-slate-400 font-bold truncate leading-none tracking-widest uppercase">{platform?.tag}</span>
              </div>
              <div class="flex justify-between items-center p-10 bg-primary/5 border border-primary/20 rounded-2xl shadow-[inset_0_0_20px_rgba(var(--primary-rgb),0.05)]">
                 <span class="mono-xs text-primary font-black uppercase tracking-widest">Deno Runtime</span>
                 <span class="text-3xl font-black text-primary tracking-tighter uppercase">V{Deno.version.deno}</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">V8 Engine Core</span>
                 <span class="text-3xl font-black text-white tracking-tighter uppercase">V{Deno.version.v8}</span>
              </div>
           </div>
        </section>
      </div>

      {/* 03 Resource Matrix */}
      <section class="animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div class="flex items-center gap-8 mb-12 pb-6 border-b border-white/5">
           <div class="w-16 h-1.5 bg-primary rounded-full shadow-[0_0_10px_var(--primary)]"></div>
           <h2 class="mono-xs font-black text-slate-400 uppercase tracking-[0.5em]">Real-Time Resource Utilization</h2>
        </div>
        <div class="t-panel glass-panel border-t-4 border-primary group relative overflow-hidden shadow-2xl transition-all hover:bg-white/[0.01]">
           <div class="absolute top-0 right-0 p-10 opacity-10">
              <svg width="150" height="150" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.3" class="text-primary"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
           </div>
           <div class="grid grid-cols-1 md:grid-cols-3 gap-24 p-8 relative z-10">
              <div class="flex flex-col gap-8">
                 <div class="flex justify-between items-center">
                    <span class="mono-xs text-slate-400 font-black uppercase tracking-[0.3em]">Memory Pressure</span>
                    <span class="status-pill success active text-[9px] tracking-widest">Buffered</span>
                 </div>
                 <div class="flex items-end gap-5">
                    <span class="text-7xl font-black text-white tabular-nums tracking-tighter leading-none">{Math.round(((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100)}</span>
                    <span class="text-2xl font-black text-slate-600 mb-2 uppercase">%</span>
                 </div>
                 <div class="h-3 bg-white/5 w-full rounded-full overflow-hidden shadow-inner">
                    <div class="h-full bg-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.5)] transition-all duration-1000" style={{ width: `${((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100}%` }}></div>
                 </div>
              </div>

              <div class="flex flex-col gap-8">
                 <div class="flex justify-between items-center">
                    <span class="mono-xs text-slate-400 font-black uppercase tracking-[0.3em]">Load Averages</span>
                    <span class="mono-xs text-slate-600 font-black uppercase tracking-widest">1m / 5m / 15m</span>
                 </div>
                 <div class="flex items-center justify-center h-[100px] border border-dashed border-white/10 rounded-3xl bg-black/40">
                    <span class="text-3xl font-black text-primary tabular-nums tracking-[0.2em] italic">{metrics?.cpu.load.join(" / ")}</span>
                 </div>
                 <div class="p-4 bg-primary/5 border border-primary/10 rounded-2xl text-center">
                    <p class="mono-xs text-primary/60 uppercase font-bold tracking-widest italic leading-none">Normalized Per Compute Core</p>
                 </div>
              </div>

              <div class="flex flex-col gap-8">
                 <div class="flex justify-between items-center">
                    <span class="mono-xs text-slate-400 font-black uppercase tracking-[0.3em]">Uptime Manifest</span>
                    <span class="status-pill success active text-[9px] tracking-widest">Continuous</span>
                 </div>
                 <div class="flex items-end gap-6">
                    <div class="flex flex-col gap-2">
                       <span class="text-7xl font-black text-white tabular-nums tracking-tighter leading-none">{Math.floor((metrics?.uptime || 0) / 86400)}</span>
                       <span class="mono-xs text-slate-600 font-black uppercase tracking-[0.4em] mt-4">Days Active</span>
                    </div>
                    <div class="text-5xl font-black text-slate-800 mb-4 italic">/</div>
                    <div class="flex flex-col gap-2">
                       <span class="text-5xl font-black text-white tabular-nums tracking-tighter leading-none opacity-80">{Math.floor(((metrics?.uptime || 0) % 86400) / 3600)}</span>
                       <span class="mono-xs text-slate-600 font-black uppercase tracking-[0.4em] mt-4">Hours</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

    </Layout>
  );
};
