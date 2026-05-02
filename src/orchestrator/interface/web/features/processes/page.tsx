import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const ProcessesPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/pages/dashboard/islands/ProcessTree.js'];

  return (
    <Layout title="Kernel Processes" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          KERNEL_HIERARCHY
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Deep Process Inspection // eBPF & Procfs Fused Tree</p>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_PROCESS_TREE_INVESTIGATION
        </h2>
        <div class="glass-panel rounded-3xl border border-white/5 bg-black/40 overflow-hidden group hover:border-white/10 transition-all">
          <div class="p-8 pb-6 border-b border-white/5 flex justify-between items-center bg-white/5 relative overflow-hidden">
            <div class="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
               <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
            </div>
            <div class="flex items-center gap-4 relative z-10">
               <div class="p-2 bg-white/5 rounded-lg text-slate-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
               </div>
               <h3 class="text-xs font-black uppercase tracking-[0.3em] text-white/80 italic">System_Process_Topology</h3>
            </div>
            <button onclick="document.querySelector('process-tree').refresh()" class="relative z-10 px-6 py-2 bg-cyber/10 hover:bg-cyber/20 border border-cyber/30 text-cyber text-[10px] font-black tracking-widest uppercase rounded-lg transition-all active:scale-95">FORCE_RESCAN</button>
          </div>
          <div class="p-10 min-h-[800px] overflow-y-auto bg-black/40 custom-scrollbar">
            <process-tree></process-tree>
          </div>
        </div>
      </div>
    </Layout>
  );
};
