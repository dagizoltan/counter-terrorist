import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

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
    <Layout title="System Information" csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          HOST_INTELLIGENCE
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Hardware & OS Deep-Dive // Real-Time Telemetry // Runtime_Environment</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
        {/* HARDWARE SPECS */}
        <section class="glass-panel rounded-3xl border border-white/5 p-10 group hover:border-white/10 transition-all">
           <div class="flex items-center gap-4 mb-10 pb-4 border-b border-white/5">
              <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
              </div>
              <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/80 italic">Hardware_Specification</h3>
           </div>
           <div class="space-y-6">
              <div class="flex justify-between items-center py-4 border-b border-white/5">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hostname</span>
                 <span class="text-sm font-black text-white italic tracking-tight uppercase">{metrics?.hostname}</span>
              </div>
              <div class="flex justify-between items-center py-4 border-b border-white/5">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">CPU Cores</span>
                 <span class="text-sm font-black text-white italic tracking-tight">{metrics?.cpu.cores} Physical / Virtual</span>
              </div>
              <div class="flex justify-between items-center py-4 border-b border-white/5">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Memory Total</span>
                 <span class="text-sm font-black text-white italic tracking-tight uppercase">{formatBytes(metrics?.memory.total)}</span>
              </div>
              <div class="flex justify-between items-center py-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Architecture</span>
                 <span class="text-sm font-black text-cyber italic tracking-widest uppercase">{Deno.build.arch}</span>
              </div>
           </div>
        </section>

        {/* OS & KERNEL */}
        <section class="glass-panel rounded-3xl border border-white/5 p-10 group hover:border-white/10 transition-all">
           <div class="flex items-center gap-4 mb-10 pb-4 border-b border-white/5">
              <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/80 italic">Software_Environment</h3>
           </div>
           <div class="space-y-6">
              <div class="flex justify-between items-center py-4 border-b border-white/5">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">OS Distribution</span>
                 <span class="text-sm font-black text-white italic tracking-tight uppercase">{platform?.name} {platform?.version}</span>
              </div>
              <div class="flex justify-between items-center py-4 border-b border-white/5">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kernel Tag</span>
                 <span class="text-sm font-mono text-white/70 tracking-tighter truncate max-w-[200px]">{platform?.tag}</span>
              </div>
              <div class="flex justify-between items-center py-4 border-b border-white/5">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Runtime</span>
                 <span class="text-sm font-black text-cyber italic tracking-widest uppercase">Deno v{Deno.version.deno}</span>
              </div>
              <div class="flex justify-between items-center py-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">V8 Engine</span>
                 <span class="text-sm font-black text-white italic tracking-tight">v{Deno.version.v8}</span>
              </div>
           </div>
        </section>

        {/* REAL-TIME UTILIZATION */}
        <section class="lg:col-span-2 glass-panel rounded-3xl border border-white/5 p-10 group hover:border-white/10 transition-all">
           <div class="flex items-center gap-4 mb-10 pb-4 border-b border-white/5">
              <div class="p-3 bg-white/5 rounded-xl text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
              </div>
              <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/80 italic">Resource_Utilization</h3>
           </div>
           <div class="grid grid-cols-1 md:grid-cols-3 gap-12">
              <div class="bg-black/40 p-8 rounded-2xl border border-white/5 relative overflow-hidden">
                 <div class="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                 </div>
                 <p class="text-[10px] font-black text-slate-500 uppercase mb-6 tracking-[0.3em]">Memory Pressure</p>
                 <div class="text-4xl font-black mb-6 italic tracking-tighter text-white">{Math.round(((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100)}%</div>
                 <div class="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-slate-700 to-slate-400" style={`width: ${((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100}%`}></div>
                 </div>
              </div>
              <div class="bg-black/40 p-8 rounded-2xl border border-white/5 relative overflow-hidden">
                 <div class="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                 </div>
                 <p class="text-[10px] font-black text-slate-500 uppercase mb-6 tracking-[0.3em]">Load Average</p>
                 <div class="text-3xl font-mono font-bold mb-6 tracking-tighter text-cyber">{metrics?.cpu.load.join(" / ")}</div>
                 <div class="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Normalized_Per_Core</div>
              </div>
              <div class="bg-black/40 p-8 rounded-2xl border border-white/5 relative overflow-hidden">
                 <div class="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                 </div>
                 <p class="text-[10px] font-black text-slate-500 uppercase mb-6 tracking-[0.3em]">Host Uptime</p>
                 <div class="text-4xl font-black mb-6 italic tracking-tighter text-white">{Math.floor((metrics?.uptime || 0) / 86400)}D {Math.floor(((metrics?.uptime || 0) % 86400) / 3600)}H</div>
                 <div class="text-[9px] font-black text-slate-600 uppercase tracking-widest italic">Continuous_Operation</div>
              </div>
           </div>
        </section>
      </div>
    </Layout>
  );
};
