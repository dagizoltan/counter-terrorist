/** @jsx jsx */
/** @jsxFrag Fragment */
import { jsx, Fragment } from "hono/jsx";
import { Layout } from "../Layout.tsx";

export const ProcessesPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/pages/dashboard/islands/ProcessTree.js'];

  return (
    <Layout title="Kernel Processes" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div class="mb-12">
        <h2 class="text-4xl font-black tracking-tighter uppercase mb-2">Kernel Hierarchy</h2>
        <p class="text-slate-500 text-xs font-medium tracking-widest uppercase">Deep process inspection // eBPF & Procfs fused tree</p>
      </div>

      <div class="bg-white/5 border border-white/5">
        <div class="p-8 pb-4 border-b border-white/5 flex justify-between items-center">
          <h2 class="text-xs font-black uppercase tracking-[0.3em]">System Process Tree</h2>
          <button onclick="document.querySelector('process-tree').refresh()" class="text-[9px] font-black tracking-widest uppercase text-slate-500 hover:text-white">FORCE_RESCAN</button>
        </div>
        <div class="p-8 min-h-[700px] overflow-y-auto bg-black/20">
          <process-tree></process-tree>
        </div>
      </div>
    </Layout>
  );
};
