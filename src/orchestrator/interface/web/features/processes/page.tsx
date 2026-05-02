import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Processes Page
 * Deep process inspection and tree view.
 */
export const ProcessesPage = (props: { csrfToken?: string }) => {
  const islandPaths = ['/components/islands/ProcessTree.js'];

  return (
    <Layout title="Kernel Processes" islandPaths={islandPaths} csrfToken={props.csrfToken}>
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-blue); border-radius:4px; box-shadow:0 0 20px var(--cyber-blue-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">KERNEL_HIERARCHY</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Deep Process Inspection // eBPF & Procfs Fused Tree</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">01_PROCESS_TREE_INVESTIGATION</h2>
        <div class="glass-panel" style="padding:0; overflow:hidden; background:rgba(0,0,0,0.4);">
          <div style="padding:2rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); position:relative;">
            <div style="position:absolute; top:0; right:0; padding:1.5rem; opacity:0.05; pointer-events:none;">
               <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
            </div>
            <div style="display:flex; align-items:center; gap:1rem;">
               <div style="padding:0.5rem; background:rgba(255,255,255,0.05); border-radius:0.5rem; color:var(--text-secondary);">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
               </div>
               <h3 class="mono-label" style="color:white; font-style:italic; opacity:0.8;">System_Process_Topology</h3>
            </div>
            <button onclick="document.querySelector('process-tree').refresh()" class="tactical-button" style="padding:0.5rem 1.5rem;">FORCE_RESCAN</button>
          </div>
          <div style="padding:2.5rem; min-height:600px; overflow-y:auto; background:rgba(0,0,0,0.4);">
            <process-tree></process-tree>
          </div>
        </div>
      </div>
    </Layout>
  );
};
