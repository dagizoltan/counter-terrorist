import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const ProcessesPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/components/islands/ProcessTree.js'];

  return (
    <Layout title="Kernel Processes" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      {/* 1. Header Section */}
      <header class="flex justify-between items-end mb-12 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-primary rounded shadow-primary"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase">Kernel_Hierarchy</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-primary"></span>
                <span class="mono-xs font-black text-primary tracking-widest uppercase">eBPF_FUSION_ACTIVE</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">INSPECTION_MODE: REAL_TIME</div>
            </div>
          </div>
        </div>
        <div class="flex gap-4">
          <button class="t-btn" onclick="document.querySelector('process-tree')?.update()">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
            Force_Rescan
          </button>
        </div>
      </header>

      {/* 2. Primary Topology Table */}
      <div class="grid grid-cols-12 gap-6">
        <div class="col-span-12 t-panel glass-panel p-0 overflow-hidden border-t-4 border-primary">
           <header class="p-8 border-b border-white/5 flex justify-between items-center bg-black/20">
              <div class="flex items-center gap-6">
                 <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded shadow-primary">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                 </div>
                 <div>
                    <h2 class="tactical-title text-xl">SYSTEM_PROCESS_TOPOLOGY</h2>
                    <p class="mono-xs text-slate-500 font-bold uppercase tracking-widest mt-2">Real-time analysis of execution lineages & resource mapping</p>
                 </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="dot active shadow-primary animate-pulse"></span>
                <span class="mono-xs font-black text-primary tracking-widest uppercase">Analyzing_Namespace</span>
              </div>
           </header>
           
           <div class="p-8 bg-black/40 min-h-[600px] overflow-x-auto custom-scrollbar">
              <process-tree></process-tree>
           </div>
           
           <footer class="p-6 border-t border-white/5 bg-black/20 flex justify-between items-center">
              <div class="flex gap-8">
                 <div class="flex items-center gap-3">
                    <div class="w-2 h-2 bg-primary rounded-full shadow-primary"></div>
                    <span class="mono-xs text-slate-500 font-black tracking-widest">SOVEREIGN_THREAD</span>
                 </div>
                 <div class="flex items-center gap-3">
                    <div class="w-2 h-2 bg-danger rounded-full shadow-danger"></div>
                    <span class="mono-xs text-slate-500 font-black tracking-widest">UNLINKED_GHOST</span>
                 </div>
              </div>
              <span class="mono-xs text-slate-700 font-black uppercase tracking-widest">Isolation_Level: KERNEL_STRICT</span>
           </footer>
        </div>
      </div>
    </Layout>
  );
};
