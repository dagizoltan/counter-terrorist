/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";
import { ApplicationStatus } from "../../core/ports.ts";

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
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Host Intelligence</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Hardware & OS deep-dive // Real-time telemetry</p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* HARDWARE SPECS */}
        <section class="bg-white/5 border border-white/5 p-8">
           <h3 class="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">Hardware Specification</h3>
           <div class="space-y-6">
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hostname</span>
                 <span class="text-xs font-bold text-white">{metrics?.hostname}</span>
              </div>
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">CPU Cores</span>
                 <span class="text-xs font-bold text-white">{metrics?.cpu.cores} Physical / Virtual</span>
              </div>
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Memory Total</span>
                 <span class="text-xs font-bold text-white">{formatBytes(metrics?.memory.total)}</span>
              </div>
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Architecture</span>
                 <span class="text-xs font-bold text-white">{Deno.build.arch}</span>
              </div>
           </div>
        </section>

        {/* OS & KERNEL */}
        <section class="bg-white/5 border border-white/5 p-8">
           <h3 class="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">Software Environment</h3>
           <div class="space-y-6">
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">OS Distribution</span>
                 <span class="text-xs font-bold text-white">{platform?.name} {platform?.version}</span>
              </div>
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Kernel Tag</span>
                 <span class="text-xs font-bold text-white">{platform?.tag}</span>
              </div>
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Runtime</span>
                 <span class="text-xs font-bold text-white">Deno v{Deno.version.deno}</span>
              </div>
              <div class="flex justify-between border-b border-white/5 pb-4">
                 <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest">V8 Engine</span>
                 <span class="text-xs font-bold text-white">v{Deno.version.v8}</span>
              </div>
           </div>
        </section>

        {/* REAL-TIME UTILIZATION */}
        <section class="lg:col-span-2 bg-white/5 border border-white/5 p-8">
           <h3 class="text-xs font-black uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">Resource Utilization</h3>
           <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                 <p class="text-[9px] font-black text-slate-500 uppercase mb-4 tracking-widest">Memory Pressure</p>
                 <div class="text-3xl font-black mb-4">{Math.round(((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100)}%</div>
                 <div class="w-full h-1 bg-white/5">
                    <div class="h-full bg-white" style={`width: ${((metrics?.memory.used || 0) / (metrics?.memory.total || 1)) * 100}%`}></div>
                 </div>
              </div>
              <div>
                 <p class="text-[9px] font-black text-slate-500 uppercase mb-4 tracking-widest">Load Average (1/5/15)</p>
                 <div class="text-3xl font-black mb-4">{metrics?.cpu.load.join(" / ")}</div>
                 <div class="text-[10px] font-bold text-slate-500 uppercase">Normalized per core</div>
              </div>
              <div>
                 <p class="text-[9px] font-black text-slate-500 uppercase mb-4 tracking-widest">Host Uptime</p>
                 <div class="text-3xl font-black mb-4">{Math.floor((metrics?.uptime || 0) / 86400)}D {Math.floor(((metrics?.uptime || 0) % 86400) / 3600)}H</div>
                 <div class="text-[10px] font-bold text-slate-500 uppercase">Continuous Operation</div>
              </div>
           </div>
        </section>
      </div>
    </Layout>
  );
};
