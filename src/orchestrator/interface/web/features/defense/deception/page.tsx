import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { HoneypotModule } from "@domain/protection/honeypot_service.ts";

/**
 * Honeypots Page
 * Deception infrastructure management.
 */
export const HoneypotsPage = (props: { modules: HoneypotModule[] }) => {
  return (
    <Layout title="Honeypot Infrastructure">
      <header class="flex justify-between items-end mb-12">
        <div class="flex items-center gap-6">
          <div style="width:12px; height:60px; background:var(--warning); border-radius:4px; box-shadow:0 0 20px var(--warning-glow);"></div>
          <div class="flex flex-col gap-2">
            <h1 style="font-size:4rem; line-height:0.9; letter-spacing:-0.07em; font-weight:900; color:white; margin:0;">DECEPTION_OPS</h1>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2">
                <span class="dot active" style="background:var(--warning);"></span>
                <span class="mono text-[10px] font-black text-warning tracking-[0.2em]">DECOYS_DEPLOYED</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono text-[10px] font-bold text-slate-500 tracking-[0.15em] uppercase">TRAP_NETWORK: ACTIVE</div>
            </div>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-8 mb-12">
        <div class="col-span-12 lg:col-span-8 t-panel p-0 overflow-hidden">
           <header class="p-8 border-b border-white/5 bg-black/20 flex justify-between items-center">
              <h3 class="tactical-title" style="font-size:1rem;">ACTIVE_DECOY_GRID</h3>
              <div class="px-3 py-1 bg-warning/10 border border-warning/30 text-warning text-[9px] font-black tracking-widest uppercase">REAL-TIME_MANIFEST</div>
           </header>
           <div class="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 bg-black/40">
              {props.modules.map(module => (
                <div class="t-panel flex flex-col justify-between group transition-all hover:border-warning/20">
                  <div>
                    <div class="flex justify-between items-start mb-6 pb-4 border-b border-white/[0.05]">
                      <div class="flex items-center gap-3">
                         <span class={`dot ${module.active ? "active" : ""}`} style={module.active ? 'background:var(--warning);' : 'background:var(--danger);'}></span>
                         <span class="mono text-[10px] font-black text-white uppercase tracking-widest">{module.name}</span>
                      </div>
                      <span class="mono text-[9px] font-black text-slate-500 uppercase tracking-widest opacity-40">PORT_{module.port}</span>
                    </div>
                    <p class="mono text-[11px] text-slate-500 leading-relaxed mb-10 group-hover:text-slate-300 transition-colors uppercase tracking-tight">{module.description}</p>
                  </div>
                  
                  <div class="flex gap-4">
                    <a href={`/honeypots/${module.id}`} class="t-btn flex-1 text-center" style="text-decoration:none; background:transparent; border-color:var(--border-subtle); padding:0.8rem 0;">Inspect_Logs</a>
                    <button 
                      onclick={`fetch('/honeypots/api/${module.id}/toggle', { method: 'POST', body: JSON.stringify({ active: ${!module.active} }), headers: { 'Content-Type': 'application/json' } }).then(() => location.reload())`}
                      class={`t-btn flex-1 ${module.active ? "danger" : ""}`}
                      style={module.active ? 'background:transparent; border-color:var(--danger); color:var(--danger); padding:0.8rem 0;' : 'background:var(--warning); color:black; padding:0.8rem 0;'}
                    >
                      {module.active ? "Deactivate" : "Deploy"}
                    </button>
                  </div>
                </div>
              ))}
           </div>
        </div>
        <div class="col-span-12 lg:col-span-4 space-y-8">
           <div class="t-panel">
              <span class="metric-tag mb-8 block">Global_Trap_Configuration</span>
              <div class="space-y-4">
                 <button class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle); padding:1.2rem;">Morph_Decoy_Signatures</button>
                 <button class="t-btn w-full" style="background:transparent; border-color:var(--border-subtle); padding:1.2rem;">Rotate_Trap_Keys</button>
              </div>
           </div>
           <div class="t-panel" style="background:radial-gradient(circle at top right, hsla(var(--warning-h), 100%, 50%, 0.03), transparent 70%);">
              <span class="metric-tag mb-6 block">Mesh_Deception_Status</span>
              <div class="space-y-4">
                 <div class="flex justify-between items-center">
                    <span class="mono text-[10px] text-slate-500 uppercase tracking-widest">Active_Decoys</span>
                    <span class="mono text-lg font-black text-white italic">{props.modules.filter(m => m.active).length}</span>
                 </div>
                 <div class="flex justify-between items-center">
                    <span class="mono text-[10px] text-slate-500 uppercase tracking-widest">Global_Hits</span>
                    <span class="mono text-lg font-black text-warning italic">...</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </Layout>
  );
};
