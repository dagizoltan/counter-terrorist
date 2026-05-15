import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * System Info Page
 * Hardware, OS, and overall node health metadata.
 * Refactored to unified tactical tokens.
 */
export const SystemInfoPage = (props: { status: any, csrfToken?: string, nonce?: string, hostname?: string }) => {
  return (
    <Layout nonce={props.nonce} title="System Info // Node Metadata" islandPaths={[
      '/components/islands/SystemHealth.js'
    ]} csrfToken={props.csrfToken}>
      
      <header class="page-header animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="title-group">
          <h1 class="tactical-title text-4xl">Platform Metadata</h1>
          <span class="subtitle">Node: {props.status?.platform?.hostname || 'SVRGN-NODE'}</span>
        </div>
        <div class="flex items-center gap-6">
           <div class="flex items-center gap-6 bg-primary/10 border border-primary/20 px-8 py-4 rounded-full backdrop-blur-xl shadow-[0_0_20px_rgba(var(--primary-rgb),0.15)]">
              <span class="dot active"></span>
              <span class="mono-xs font-black text-primary tracking-[0.4em] uppercase">Node Online</span>
           </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div class="col-span-12 lg:col-span-6 t-panel glass-panel border-t-2 border-primary/30 p-0 overflow-hidden group hover:bg-white/[0.02]">
           <header class="p-8 border-b border-white/10 flex items-center gap-6 bg-black/40 backdrop-blur-md">
              <div class="p-4 bg-primary/10 border border-primary/20 text-primary rounded-xl">
                 <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div class="flex flex-col gap-2">
                 <h3 class="tactical-title text-xl tracking-widest uppercase">Hardware Telemetry</h3>
              </div>
           </header>
           <div class="p-10 bg-black/20">
              <system-health></system-health>
           </div>
        </div>
        
        <div class="col-span-12 lg:col-span-6 t-panel glass-panel border-t-2 border-slate-700 p-0 overflow-hidden group hover:bg-white/[0.02]">
           <header class="p-8 border-b border-white/10 flex items-center gap-6 bg-black/40 backdrop-blur-md">
              <div class="p-4 bg-white/5 border border-white/10 text-slate-400 rounded-xl">
                 <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="3" x2="21" y1="9" y2="9"/><line x1="9" x2="9" y1="21" y2="9"/></svg>
              </div>
              <div class="flex flex-col gap-2">
                 <h3 class="tactical-title text-xl tracking-widest uppercase">Platform Manifest</h3>
              </div>
           </header>
           <div class="p-10 flex flex-col gap-6 bg-black/20">
              <div class="flex justify-between items-center p-8 bg-black/40 rounded-2xl border border-white/5 hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">OS Kernel</span>
                 <span class="text-2xl font-black text-white italic tracking-tighter uppercase">{props.status?.platform?.os || 'Linux 6.x'}</span>
              </div>
              <div class="flex justify-between items-center p-8 bg-black/40 rounded-2xl border border-white/5 hover:border-primary/30 transition-all group/item">
                 <span class="mono-xs text-slate-500 font-black uppercase tracking-widest group-hover/item:text-primary transition-colors">Architecture</span>
                 <span class="text-2xl font-black text-white italic tracking-tighter uppercase">{props.status?.platform?.arch || 'x86_64'}</span>
              </div>
              <div class="flex justify-between items-center p-10 bg-primary/5 rounded-2xl border border-primary/20 shadow-[inset_0_0_20px_rgba(var(--primary-rgb),0.05)]">
                 <span class="mono-xs text-primary font-black uppercase tracking-widest">Uptime Signature</span>
                 <span class="text-3xl font-black text-primary italic tracking-tighter uppercase tabular-nums">{props.status?.platform?.uptime || '0s'}</span>
              </div>
           </div>
        </div>
      </div>
    </Layout>
  );
};
