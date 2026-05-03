import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * System Information Page
 * Hardware and OS deep-dive with high-fidelity tactical grid.
 */
export const SysInfoPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
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
    <Layout title="Host Intelligence // System Info" csrfToken={props.csrfToken} islandPaths={['/components/islands/MetricsHydrator.js']}>
      
      {/* 01_Unified_Page_Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Host Intelligence</h1>
          <span class="subtitle">System Telemetry Established // Runtime: Stable</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-6 bg-primary/10 border border-primary/20 px-10 py-4 rounded-full shadow-primary/10">
              <span class="dot active shadow-primary"></span>
              <span class="status-pill primary border-none bg-transparent p-0">Telemetry_Live</span>
           </div>
        </div>
      </header>

      {/* 02_Platform_Architecture */}
      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        {/* Hardware Specs */}
        <section class="col-span-12 lg:col-span-6 t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-800 group">
           <header class="p-10 border-b border-white/10 flex items-center gap-8 bg-black/40 backdrop-blur-md">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-xl shadow-inner group-hover:text-primary transition-colors duration-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
              </div>
              <div>
                 <h3 class="tactical-title text-xl tracking-widest">HARDWARE_SPECIFICATION</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Physical layer audit & inventory</p>
              </div>
           </header>
           
           <div class="p-12 flex flex-col gap-8 bg-black/20">
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl transition-all hover:bg-white/[0.03] group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">System_Hostname</span>
                 <span class="text-2xl font-black text-white tracking-tighter uppercase italic">{metrics?.hostname}</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl transition-all hover:bg-white/[0.03] group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Processor_Cores</span>
                 <span class="text-2xl font-black text-white tracking-tighter uppercase">{metrics?.cpu.cores} THREADS</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl transition-all hover:bg-white/[0.03] group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Physical_Memory</span>
                 <span class="text-2xl font-black text-white tracking-tighter uppercase">{formatBytes(metrics?.memory.total)}</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-primary/5 border border-primary/20 rounded-2xl transition-all hover:bg-primary/10 group/item shadow-inner">
                 <span class="mono-xs text-primary font-black uppercase tracking-widest">Architecture</span>
                 <span class="text-2xl font-black text-primary tracking-tighter uppercase">{Deno.build.arch}</span>
              </div>
           </div>
        </section>

        {/* OS & Environment */}
        <section class="col-span-12 lg:col-span-6 t-panel glass-panel p-0 overflow-hidden border-t-2 border-slate-800 group">
           <header class="p-10 border-b border-white/10 flex items-center gap-8 bg-black/40 backdrop-blur-md">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-xl shadow-inner group-hover:text-primary transition-colors duration-500">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <div>
                 <h3 class="tactical-title text-xl tracking-widest">SOFTWARE_ENVIRONMENT</h3>
                 <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Sovereign runtime & kernel state</p>
              </div>
           </header>

           <div class="p-10 flex flex-col gap-10 bg-black/20">
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl transition-all hover:bg-white/[0.03] group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">OS_Distribution</span>
                 <span class="text-2xl font-black text-white tracking-tighter uppercase">{platform?.name} {platform?.version}</span>
              </div>
              <div class="flex flex-col gap-4 p-8 bg-black/40 border border-white/5 rounded-2xl transition-all hover:bg-white/[0.03] group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Kernel_Build_Tag</span>
                 <span class="mono-xs text-slate-400 font-bold truncate leading-none tracking-widest">{platform?.tag}</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-primary/5 border border-primary/20 rounded-2xl transition-all hover:bg-primary/10 group/item shadow-inner">
                 <span class="mono-xs text-primary font-black uppercase tracking-widest">Deno_Runtime</span>
                 <span class="text-2xl font-black text-primary tracking-tighter uppercase">V{Deno.version.deno}</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/40 border border-white/5 rounded-2xl transition-all hover:bg-white/[0.03] group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">V8_Engine_Core</span>
                 <span class="text-2xl font-black text-white tracking-tighter uppercase">V{Deno.version.v8}</span>
              </div>
           </div>
        </section>
      </div>

      {/* 03_Resource_Matrix */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
        <div class="flex items-center gap-6 mb-10 pb-4 border-b border-white/5">
           <div class="w-12 h-1.5 bg-primary rounded-full shadow-primary"></div>
           <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">03_REAL-TIME_RESOURCE_UTILIZATION</h2>
        </div>
        <div class="t-panel glass-panel border-t-4 border-primary group relative">
           <div class="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.5"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
           </div>
           <div class="grid grid-cols-1 md:grid-cols-3 gap-24 relative z-10">
              <div class="flex flex-col gap-10">
                 <div class="flex justify-between items-center">
                    <span class="mono-xs text-slate-400 font-black uppercase tracking-[0.2em]">Memory_Pressure</span>
                    <span class="status-pill success">BUFFERED</span>
                 </div>
                 <div class="flex items-end gap-4">
                    <span class="mono-lg font-black text-white tabular-nums tracking-widest leading-none">{Math.round(((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100)}</span>
                    <span class="mono-md font-black text-slate-700 mb-2 uppercase">%</span>
                 </div>
                 <div class="h-3 bg-white/5 w-full rounded-full overflow-hidden shadow-inner">
                    <div class="h-full bg-primary shadow-primary transition-all duration-[1500ms] ease-out" style={{ width: `${((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100}%` }}></div>
                 </div>
              </div>

              <div class="flex flex-col gap-10">
                 <div class="flex justify-between items-center">
                    <span class="mono-xs text-slate-400 font-black uppercase tracking-[0.2em]">Load_Averages</span>
                    <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">1m / 5m / 15m</span>
                 </div>
                 <div class="flex items-end gap-4 h-[70px]">
                    <span class="mono-md font-black text-primary tabular-nums tracking-widest leading-none">{metrics?.cpu.load.join(" / ")}</span>
                 </div>
                 <div class="p-4 bg-white/[0.02] border border-white/5 rounded-lg">
                    <p class="mono-xs text-slate-600 uppercase font-black tracking-widest italic leading-none">Normalized_Per_Compute_Core</p>
                 </div>
              </div>

              <div class="flex flex-col gap-10">
                 <div class="flex justify-between items-center">
                    <span class="mono-xs text-slate-400 font-black uppercase tracking-[0.2em]">Uptime_Manifest</span>
                    <span class="status-pill success">CONTINUOUS</span>
                 </div>
                 <div class="flex items-end gap-8">
                    <div class="flex flex-col">
                       <span class="mono-lg font-black text-white tabular-nums tracking-widest leading-none">{Math.floor((metrics?.uptime || 0) / 86400)}</span>
                       <span class="mono-xs text-slate-600 font-black uppercase tracking-[0.3em] mt-4">Days_Active</span>
                    </div>
                    <div class="mono-lg font-black text-slate-700 mb-2">/</div>
                    <div class="flex flex-col">
                       <span class="mono-md font-black text-white tabular-nums tracking-widest leading-none">{Math.floor(((metrics?.uptime || 0) % 86400) / 3600)}</span>
                       <span class="mono-xs text-slate-600 font-black uppercase tracking-[0.3em] mt-4">Hours</span>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </section>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
