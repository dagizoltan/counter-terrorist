import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const ProcessesPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/components/islands/ProcessTree.js'];

  return (
    <Layout title="Kernel Processes" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Kernel Hierarchy</h1>
          <span class="subtitle">eBPF Fusion Active // Inspection Mode: Real-Time</span>
        </div>
        <div class="flex gap-4">
          <button class="t-btn px-8 py-4 text-[10px] font-black group" onclick="document.querySelector('process-tree')?.update()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-2 group-hover:rotate-180 transition-transform duration-700"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>
            Force_Hierarchy_Rescan
          </button>
        </div>
      </header>

      {/* 2. Primary Topology Table */}
      <div class="grid grid-cols-12 gap-10 animate-fade-in" style="animation-delay: 100ms;">
        <div class="col-span-12 t-panel glass-panel p-0 border-t-2 border-primary group">
           <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
              <div class="flex items-center gap-8">
                 <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-xl shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                 </div>
                 <div>
                    <h2 class="tactical-title text-2xl tracking-widest">SYSTEM_PROCESS_TOPOLOGY</h2>
                    <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">Real-time analysis of execution lineages & resource mapping</p>
                 </div>
              </div>
              <div class="status-pill active primary pulse">Analyzing_Namespace</div>
           </header>
           
           <div class="p-12 bg-black/20 min-h-[700px] overflow-x-auto custom-scrollbar shadow-inner relative">
              <div class="absolute inset-0 pointer-events-none opacity-[0.03] bg-[radial-gradient(circle_at_center,_var(--primary)_0%,_transparent_70%)]"></div>
              <div id="process-root" class="flex flex-col gap-6 mb-12">
                  <div class="skeleton h-12 w-full"></div>
                  <div class="skeleton h-12 w-full opacity-60"></div>
                  <div class="skeleton h-12 w-full opacity-30"></div>
              </div>
              <process-tree></process-tree>
           </div>
           
           <footer class="p-10 border-t border-white/5 bg-black/10 flex justify-between items-center">
              <div class="flex gap-12">
                 <div class="flex items-center gap-4 group/hint">
                    <div class="w-3 h-3 bg-primary rounded-full shadow-primary group-hover/hint:scale-125 transition-transform"></div>
                    <span class="mono-xs text-slate-500 font-black tracking-[0.2em] uppercase">SOVEREIGN_THREAD</span>
                 </div>
                 <div class="flex items-center gap-4 group/hint">
                    <div class="w-3 h-3 bg-danger rounded-full shadow-danger group-hover/hint:scale-125 transition-transform"></div>
                    <span class="mono-xs text-slate-500 font-black tracking-[0.2em] uppercase">UNLINKED_GHOST</span>
                 </div>
              </div>
              <div class="px-6 py-2 bg-white/[0.03] border border-white/5 rounded-full">
                 <span class="mono-xs text-slate-700 font-black uppercase tracking-[0.3em]">Isolation_Level: <span class="text-slate-400">KERNEL_STRICT</span></span>
              </div>
           </footer>
        </div>
      </div>
    </Layout>
  );
};
