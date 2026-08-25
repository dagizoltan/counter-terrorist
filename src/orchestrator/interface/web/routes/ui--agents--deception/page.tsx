import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { HoneypotModule } from "@domain/protection/honeypot_service.ts";

/**
 * Honeypots Page
 * Deception infrastructure management.
 */
export const HoneypotsPage = (props: { modules: HoneypotModule[], csrfToken?: string, nonce?: string, userRole?: string }) => {
  return (
    <Layout title="Honeypot Infrastructure" csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Deception Operations</h1>
          <span class="subtitle">Decoys Deployed // Trap Network: Active</span>
        </div>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-4 bg-warning/10 border border-warning/30 px-4 py-4 rounded-full">
            <span class="dot active" style="background:var(--warning)"></span>
            <span class="eyebrow" data-tone="warning">Decoy Grid Active</span>
          </div>
        </div>
      </header>

      <div class="t-panel glass-panel p-0 border-t-2 border-warning/30 group mb-4">
          <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
            <div class="flex items-center gap-4">
                <div class="p-4 bg-warning/10 border border-warning/30 text-warning rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <h3 class="tactical-title text-2xl tracking-widest">ACTIVE DECOY GRID</h3>
            </div>
            <div class="status-pill warning">REAL TIME MANIFEST</div>
          </header>
          <div class="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-black/20">
            {props.modules.map(module => (
              <div class="t-panel glass-panel border-t-2 border-slate-800 flex flex-col justify-between group hover:bg-white/[0.02]">
                <div>
                  <div class="flex justify-between items-start mb-4 pb-4 border-b border-white/5">
                    <div class="flex items-center gap-4">
                        <span class="dot active" style={module.active ? 'background:var(--warning);' : 'background:var(--slate-800);'}></span>
                        <span class="eyebrow italic" data-tone="strong">{module.name}</span>
                    </div>
                    <span class="eyebrow opacity-40">PORT {module.port}</span>
                  </div>
                  <p class="mono-xs text-slate-500 mb-5 leading-relaxed font-bold uppercase tracking-tight opacity-50">
                    {module.description}
                  </p>
                </div>
                
                <div class="flex gap-4 pt-4 border-t border-white/5">
                  <a href={`/agents/deception/${module.id}`} class="t-btn flex-1 text-center justify-center text-[9px] py-3">Inspect Logs</a>
                  {(props.userRole === "admin" || props.userRole === "operator") && (
                  <button 
                    type="button"
                    onclick={`const t=document.querySelector('meta[name="csrf-token"]')?.content; fetch('/agents/deception/api/${module.id}/toggle', { method: 'POST', body: JSON.stringify({ active: ${!module.active} }), headers: { 'Content-Type': 'application/json', 'X-CT-Token': t || '' } }).then(() => location.reload())`}
                    class={`t-btn flex-1 justify-center text-[9px] py-3 ${module.active ? "danger" : "warning"}`}
                  >
                    {module.active ? "Kill Decoy" : "Deploy Trap"}
                  </button>
                  )}
                </div>
              </div>
            ))}
          </div>
      </div>

      <div class="grid grid-cols-12 gap-4 mb-5">
        {(props.userRole === "admin" || props.userRole === "operator") && (
        <div class="col-span-12 lg:col-span-6">
           <div class="t-panel glass-panel border-t-2 border-primary group h-full">
              <header class="flex items-center gap-4 mb-5 pb-4 border-b border-white/10">
                 <div class="w-10 h-1.5 bg-primary rounded-full"></div>
                 <h3 class="tactical-title text-lg tracking-widest">TRAP CONFIGURATION</h3>
              </header>
              <div class="grid grid-cols-2 gap-4">
                 <button type="button" class="t-btn w-full py-3 text-[9px] font-black uppercase tracking-[0.3em]">Morph Decoy Signatures</button>
                 <button type="button" class="t-btn w-full py-3 text-[9px] font-black uppercase tracking-[0.3em]">Rotate Trap Keys</button>
                 <button type="button" class="t-btn w-full py-3 text-[9px] font-black uppercase tracking-[0.3em] bg-warning/5 border-warning/20 text-warning">Inject Network Latency</button>
                 {props.userRole === "admin" && (
                 <button type="button" class="t-btn w-full py-3 text-[9px] font-black uppercase tracking-[0.3em] danger">Flush All Decoys</button>
                 )}
              </div>
           </div>
        </div>
        )}
        
        <div class="col-span-12 lg:col-span-6">
           <div class="t-panel glass-panel border-t-4 border-warning group h-full">
              <div class="flex justify-between items-start mb-5 pb-4 border-b border-white/10">
                 <div class="flex flex-col gap-2">
                    <h3 class="tactical-title text-lg tracking-widest">MESH STATUS</h3>
                    <p class="eyebrow">Global Trap Network</p>
                 </div>
                 <span class="dot active" style="background:var(--warning)"></span>
              </div>
              <div class="grid grid-cols-2 gap-4">
                 <div class="flex justify-between items-center p-4 bg-black/40 rounded-lg border border-white/5">
                    <span class="eyebrow">Active Decoys</span>
                    <span class="text-4xl font-black text-white tabular-nums tracking-tighter">{props.modules.filter(m => m.active).length}</span>
                 </div>
                 <div class="flex justify-between items-center p-4 bg-black/40 rounded-lg border border-white/5">
                    <span class="eyebrow">Trap Health</span>
                    <span class="text-4xl font-black text-warning tabular-nums tracking-tighter">98.4%</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

    </Layout>
  );
};
