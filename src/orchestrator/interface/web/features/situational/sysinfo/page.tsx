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
    <Layout title="Host Intelligence // System Info" csrfToken={props.csrfToken}>
      
      {/* 01_Header_Section */}
      <header class="flex justify-between items-end mb-16 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-primary rounded shadow-primary"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Host_Intel</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-primary animate-pulse"></span>
                <span class="mono-xs font-black text-primary tracking-widest uppercase">Telemetry_Link_Established</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">Runtime_State: STABLE</div>
            </div>
          </div>
        </div>
      </header>

      {/* 02_Platform_Architecture */}
      <div class="grid grid-cols-12 gap-8 mb-16 animate-fade-in" style="animation-delay: 100ms;">
        {/* Hardware Specs */}
        <section class="col-span-12 lg:col-span-6 t-panel glass-panel p-10 border-t-2 border-slate-800">
           <header class="flex items-center gap-6 mb-12 pb-6 border-b border-white/5">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-lg shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
              </div>
              <h3 class="tactical-title text-sm uppercase tracking-widest">HARDWARE_SPECIFICATION</h3>
           </header>
           
           <div class="flex flex-col gap-8">
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag">System_Hostname</span>
                 <span class="text-xl font-black text-white tracking-tighter uppercase italic">{metrics?.hostname}</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag">Processor_Cores</span>
                 <span class="text-xl font-black text-white tracking-tighter uppercase">{metrics?.cpu.cores} THREADS</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag">Physical_Memory</span>
                 <span class="text-xl font-black text-white tracking-tighter uppercase">{formatBytes(metrics?.memory.total)}</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-primary/5 border border-primary/20 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag text-primary">Architecture</span>
                 <span class="text-xl font-black text-primary tracking-tighter uppercase">{Deno.build.arch}</span>
              </div>
           </div>
        </section>

        {/* OS & Environment */}
        <section class="col-span-12 lg:col-span-6 t-panel glass-panel p-10 border-t-2 border-slate-800">
           <header class="flex items-center gap-6 mb-12 pb-6 border-b border-white/5">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-lg shadow-inner">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3 class="tactical-title text-sm uppercase tracking-widest">SOFTWARE_ENVIRONMENT</h3>
           </header>

           <div class="flex flex-col gap-8">
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag">OS_Distribution</span>
                 <span class="text-xl font-black text-white tracking-tighter uppercase">{platform?.name} {platform?.version}</span>
              </div>
              <div class="flex flex-col gap-4 p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag">Kernel_Build_Tag</span>
                 <span class="mono-xs text-slate-500 font-bold truncate leading-none">{platform?.tag}</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-primary/5 border border-primary/20 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag text-primary">Deno_Runtime</span>
                 <span class="text-xl font-black text-primary tracking-tighter uppercase">V{Deno.version.deno}</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-black/40 border border-white/5 rounded transition-all hover:translate-y-[-2px]">
                 <span class="metric-tag">V8_Engine_Core</span>
                 <span class="text-xl font-black text-white tracking-tighter uppercase">V{Deno.version.v8}</span>
              </div>
           </div>
        </section>
      </div>

      {/* 03_Resource_Matrix */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-10 pb-4 border-b border-white/5">03_REAL-TIME_RESOURCE_UTILIZATION</h2>
        <div class="t-panel glass-panel p-12 border-t-4 border-primary">
           <div class="grid grid-cols-1 md:grid-cols-3 gap-16">
              <div class="flex flex-col gap-6">
                 <div class="flex justify-between items-center">
                    <span class="metric-tag">Memory_Pressure</span>
                    <span class="mono-xs text-slate-700 font-black uppercase">Buffered</span>
                 </div>
                 <div class="flex items-end gap-3">
                    <span class="text-6xl font-black text-white tabular-nums tracking-tighter">{Math.round(((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100)}</span>
                    <span class="text-2xl font-black text-slate-700 mb-2 uppercase">%</span>
                 </div>
                 <div class="h-2 bg-white/5 w-full rounded-full overflow-hidden shadow-inner">
                    <div class="h-full bg-primary shadow-primary transition-all duration-1000" style={`width: \${((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100}%`}></div>
                 </div>
              </div>

              <div class="flex flex-col gap-6">
                 <div class="flex justify-between items-center">
                    <span class="metric-tag">Load_Averages</span>
                    <span class="mono-xs text-slate-700 font-black uppercase">1m / 5m / 15m</span>
                 </div>
                 <div class="flex items-end gap-3 h-[60px]">
                    <span class="text-4xl font-black text-primary tabular-nums tracking-tighter">{metrics?.cpu.load.join(" / ")}</span>
                 </div>
                 <p class="mono-xs text-slate-700 uppercase font-black tracking-widest italic leading-none">Normalized_Per_Compute_Core</p>
              </div>

              <div class="flex flex-col gap-6">
                 <div class="flex justify-between items-center">
                    <span class="metric-tag">Uptime_Manifest</span>
                    <span class="mono-xs text-slate-700 font-black uppercase">Continuous</span>
                 </div>
                 <div class="flex items-end gap-4">
                    <div class="flex flex-col">
                       <span class="text-6xl font-black text-white tabular-nums tracking-tighter leading-none">{Math.floor((metrics?.uptime || 0) / 86400)}</span>
                       <span class="mono-xs text-slate-700 font-black uppercase tracking-widest mt-2">Days</span>
                    </div>
                    <div class="text-3xl font-black text-slate-800 mb-1">/</div>
                    <div class="flex flex-col">
                       <span class="text-4xl font-black text-white tabular-nums tracking-tighter leading-none">{Math.floor(((metrics?.uptime || 0) % 86400) / 3600)}</span>
                       <span class="mono-xs text-slate-700 font-black uppercase tracking-widest mt-2">Hours</span>
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
