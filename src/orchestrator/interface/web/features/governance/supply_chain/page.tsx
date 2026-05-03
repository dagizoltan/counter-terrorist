import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const SupplyChainPage = (props: { sbom: any[]; healthScore: number; csrfToken: string }) => {
  return (
    <Layout title="Supply Chain Integrity" csrfToken={props.csrfToken}>
      <header class="flex justify-between items-end mb-12 animate-fade-in">
        <div class="flex items-center gap-10">
          <div class="relative">
            <div class="w-4 h-20 bg-success rounded shadow-success"></div>
            <div class="absolute inset-0 bg-success/20 blur-xl animate-pulse"></div>
          </div>
          <div class="flex flex-col gap-3">
            <h1 class="text-7xl font-black text-white tracking-tighter leading-none m-0 uppercase italic skew-x-[-4deg]">Supply_Chain</h1>
            <div class="flex items-center gap-8">
              <div class="flex items-center gap-3">
                <span class="dot active shadow-success pulse"></span>
                <span class="mono-xs font-black text-success tracking-[0.3em] uppercase">SBOM_VERIFIED_CHAIN</span>
              </div>
              <span class="text-slate-800 font-black">//</span>
              <div class="mono-xs font-bold text-slate-500 tracking-[0.3em] uppercase">INTEGRITY_SCORE: {props.healthScore}%</div>
            </div>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-8 mb-16 animate-fade-in">
         <div class="col-span-12 lg:col-span-8">
            <div class="t-panel glass-panel p-12 relative overflow-hidden">
               <div class="flex justify-between items-center mb-12 pb-8 border-b border-white/5">
                  <h2 class="tactical-title text-2xl uppercase tracking-widest">Dependency_Manifest (SBOM)</h2>
                  <div class="status-pill active px-6 py-2 shadow-primary font-black">{props.sbom.length}_ACTIVE_DEPS</div>
               </div>

               <div class="overflow-x-auto">
                  <table class="w-full text-left border-collapse">
                    <thead>
                       <tr class="border-b border-white/5">
                          <th class="p-6 mono-xs font-black text-slate-600 uppercase tracking-widest">Package_Name</th>
                          <th class="p-6 mono-xs font-black text-slate-600 uppercase tracking-widest">Version</th>
                          <th class="p-6 mono-xs font-black text-slate-600 uppercase tracking-widest">License</th>
                          <th class="p-6 mono-xs font-black text-slate-600 uppercase tracking-widest">Status</th>
                       </tr>
                    </thead>
                    <tbody>
                       {props.sbom.map((dep, idx) => (
                         <tr key={idx} class="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                            <td class="p-6">
                               <div class="flex items-center gap-4">
                                  <div class={`w-2 h-2 rounded-full ${dep.status === 'SECURE' ? 'bg-success shadow-success' : 'bg-danger shadow-danger pulse'}`}></div>
                                  <span class="mono-sm font-black text-white group-hover:text-primary transition-colors tracking-tight">{dep.name}</span>
                               </div>
                            </td>
                            <td class="p-6 mono-xs text-slate-500 font-bold">{dep.version}</td>
                            <td class="p-6">
                               <span class="mono-xs text-slate-600 bg-white/5 px-3 py-1 rounded border border-white/5">{dep.license}</span>
                            </td>
                            <td class="p-6">
                               <div class={`status-pill ${dep.status === 'SECURE' ? 'active' : 'error'} py-1 px-4 text-[10px]`}>
                                  {dep.status} {dep.cve ? `(${dep.cve})` : ''}
                               </div>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                  </table>
               </div>
            </div>
         </div>

         <div class="col-span-12 lg:col-span-4 space-y-8">
            <div class="t-panel glass-panel p-12 border-l-4 border-l-success">
               <h3 class="tactical-title text-xl mb-10 pb-6 border-b border-white/5">Integrity_Audit</h3>
               <div class="space-y-8">
                  <div class="flex justify-between items-center bg-black/40 p-6 rounded border border-white/5">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Signed_Commits</span>
                     <span class="status-pill active px-4 py-1">100%_VALID</span>
                  </div>
                  <div class="flex justify-between items-center bg-black/40 p-6 rounded border border-white/5">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Binary_Attestation</span>
                     <span class="status-pill active px-4 py-1">VERIFIED</span>
                  </div>
                  <div class="flex justify-between items-center bg-black/40 p-6 rounded border border-white/5">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Build_Reproducibility</span>
                     <span class="status-pill warning px-4 py-1">PARTIAL</span>
                  </div>
               </div>
               
               <div class="mt-12 p-8 bg-success/5 border border-success/20 rounded-lg relative overflow-hidden group">
                  <div class="absolute inset-0 bg-success/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
                  <div class="relative z-10">
                     <div class="flex items-center gap-4 text-success mb-5">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                        <span class="tactical-title text-xs tracking-widest uppercase">Supply_Chain_Advisory</span>
                     </div>
                     <p class="mono-xs text-slate-400 leading-relaxed font-bold italic tracking-tight">
                        "Primary dependency tree is verified against sovereign hash-registry. One vulnerable package detected in simulation sandbox. Isolation recommended."
                     </p>
                  </div>
               </div>
            </div>
            
            <button class="t-btn success w-full justify-center p-6 text-xs font-black group border-2">
               <svg class="mr-3 group-hover:rotate-180 transition-transform" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
               INITIATE_DEEP_RESCAN
            </button>
         </div>
      </div>
    </Layout>
  );
};
