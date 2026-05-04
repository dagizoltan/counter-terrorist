import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * System Info Page
 * Hardware, OS, and overall node health metadata.
 */
export const SystemInfoPage = (props: { status: any, csrfToken?: string }) => {
  return (
    <Layout title="System Info // Node Metadata" islandPaths={[
      '/components/islands/SystemHealth.js'
    ]} csrfToken={props.csrfToken}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>System_Information</h1>
          <span class="subtitle">Hardware & Operational Metadata // Node: {props.status?.platform?.hostname || 'SVRGN-NODE'}</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 lg:col-span-6 t-panel glass-panel border-t-2 border-slate-700">
           <header class="mb-8 flex items-center gap-4">
              <div class="w-2 h-2 bg-primary rounded-full"></div>
              <h3 class="tactical-title text-sm tracking-widest">HARDWARE_TELEMETRY</h3>
           </header>
           <system-health></system-health>
        </div>
        
        <div class="col-span-12 lg:col-span-6 t-panel glass-panel border-t-2 border-slate-700">
           <header class="mb-8 flex items-center gap-4">
              <div class="w-2 h-2 bg-primary rounded-full"></div>
              <h3 class="tactical-title text-sm tracking-widest">PLATFORM_METADATA</h3>
           </header>
           <div class="space-y-6">
              <div class="flex justify-between items-center p-6 bg-black/40 rounded-xl border border-white/5">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">OS_Kernel</span>
                 <span class="mono-xs font-black text-white">{props.status?.platform?.os || 'Linux 6.x'}</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-black/40 rounded-xl border border-white/5">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Architecture</span>
                 <span class="mono-xs font-black text-white">{props.status?.platform?.arch || 'x86_64'}</span>
              </div>
              <div class="flex justify-between items-center p-6 bg-black/40 rounded-xl border border-white/5">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Uptime</span>
                 <span class="mono-xs font-black text-white">{props.status?.platform?.uptime || '0s'}</span>
              </div>
           </div>
        </div>
      </div>
    </Layout>
  );
};
