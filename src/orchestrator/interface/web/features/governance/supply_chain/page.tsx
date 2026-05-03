import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const SupplyChainPage = (props: { sbom: any[]; healthScore: number; csrfToken: string }) => {
  return (
    <Layout title="Supply Chain Integrity" csrfToken={props.csrfToken}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Supply Chain Integrity</h1>
          <span class="subtitle">SBOM Verified Chain // Integrity Score: {props.healthScore}%</span>
        </div>
        <div class="flex items-center gap-6">
          <div class="flex items-center gap-4 bg-success/10 border border-success/30 px-8 py-4 rounded-full shadow-success/20">
            <span class="dot active shadow-success animate-pulse"></span>
            <span class="mono-xs font-black text-success tracking-[0.4em] uppercase">SBOM_Validated</span>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-10 mb-16 animate-fade-in" style="animation-delay: 100ms;">
         <div class="col-span-12 lg:col-span-8">
            <div class="t-panel glass-panel p-0 relative border-t-2 border-primary/30 group">
               <header class="p-10 border-b border-white/10 flex justify-between items-center bg-black/40 backdrop-blur-md">
                  <div class="flex items-center gap-8">
                     <div class="p-4 bg-primary/10 border border-primary/30 text-primary rounded-xl shadow-primary/20 group-hover:scale-110 transition-transform duration-500">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                     </div>
                     <div>
                        <h2 class="tactical-title text-2xl tracking-widest">DEPENDENCY_MANIFEST</h2>
                        <p class="mono-xs text-slate-500 font-black uppercase tracking-[0.4em] mt-2">End-to-end provenance & vulnerability audit</p>
                     </div>
                  </div>
                  <div class="px-8 py-3 bg-black/60 border border-white/10 rounded-full shadow-inner">
                     <span class="mono-xs font-black text-primary tracking-[0.3em] uppercase">{props.sbom.length}_ACTIVE_DEPS</span>
                  </div>
               </header>

               <div class="overflow-x-auto custom-scrollbar bg-black/20 p-6">
                  <table class="w-full text-left border-separate border-spacing-y-4">
                    <thead>
                       <tr>
                          <th class="px-8 py-4 mono-xs font-black text-slate-600 uppercase tracking-[0.3em]">Package_Identity</th>
                          <th class="px-8 py-4 mono-xs font-black text-slate-600 uppercase tracking-[0.3em]">Version</th>
                          <th class="px-8 py-4 mono-xs font-black text-slate-600 uppercase tracking-[0.3em]">License</th>
                          <th class="px-8 py-4 mono-xs font-black text-slate-600 uppercase tracking-[0.3em]">Status</th>
                       </tr>
                    </thead>
                    <tbody>
                       {props.sbom.map((dep, idx) => (
                         <tr key={idx} class="group transition-all hover:translate-x-2">
                            <td class="px-8 py-6 bg-black/40 border-y border-l border-white/5 rounded-l-2xl group-hover:border-primary/30 transition-colors">
                               <div class="flex items-center gap-6">
                                  <div class={`w-3 h-3 rounded-full ${dep.status === 'SECURE' ? 'bg-success shadow-success' : 'bg-danger shadow-danger pulse'}`}></div>
                                  <span class="text-lg font-black text-white group-hover:text-primary transition-colors tracking-tight uppercase">{dep.name}</span>
                               </div>
                            </td>
                            <td class="px-8 py-6 bg-black/40 border-y border-white/5 mono-xs text-slate-400 font-black tracking-widest uppercase">{dep.version}</td>
                            <td class="px-8 py-6 bg-black/40 border-y border-white/5">
                               <span class="mono-xs text-slate-500 bg-white/5 px-4 py-1.5 rounded-full border border-white/10 font-black uppercase tracking-widest">{dep.license}</span>
                            </td>
                            <td class="px-8 py-6 bg-black/40 border-y border-r border-white/5 rounded-r-2xl group-hover:border-primary/30 transition-colors">
                               <div class={`status-pill ${dep.status === 'SECURE' ? 'active' : 'error'} py-2 px-6 font-black tracking-[0.2em]`}>
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

         <div class="col-span-12 lg:col-span-4 space-y-10">
            <div class="t-panel glass-panel border-t-4 border-t-success group hover:bg-white/[0.02] transition-all">
               <div class="flex items-center gap-6 mb-12 pb-6 border-b border-white/10">
                  <div class="w-10 h-1.5 bg-success rounded-full shadow-success"></div>
                  <h3 class="tactical-title text-xl uppercase tracking-widest">INTEGRITY_AUDIT</h3>
               </div>
               <div class="space-y-10">
                  <div class="flex justify-between items-center bg-black/60 p-8 rounded-2xl border border-white/10 shadow-inner group/item hover:border-success/30 transition-colors">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em] group-hover/item:text-success transition-colors">Signed_Commits</span>
                     <span class="status-pill active px-6 py-2 font-black shadow-success/20">100%_VALID</span>
                  </div>
                  <div class="flex justify-between items-center bg-black/60 p-8 rounded-2xl border border-white/10 shadow-inner group/item hover:border-success/30 transition-colors">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em] group-hover/item:text-success transition-colors">Binary_Attestation</span>
                     <span class="status-pill active px-6 py-2 font-black shadow-success/20">VERIFIED</span>
                  </div>
                  <div class="flex justify-between items-center bg-black/60 p-8 rounded-2xl border border-white/10 shadow-inner group/item hover:border-warning/30 transition-colors">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-[0.3em] group-hover/item:text-warning transition-colors">Build_Reproducibility</span>
                     <span class="status-pill warning px-6 py-2 font-black shadow-warning/20">PARTIAL</span>
                  </div>
               </div>
               
               <div class="mt-12 p-8 bg-success/5 border border-success/20 rounded-2xl relative overflow-hidden group/alert shadow-inner">
                  <div class="absolute inset-0 bg-success/5 translate-y-full group-hover/alert:translate-y-0 transition-transform duration-700"></div>
                  <div class="relative z-10">
                     <div class="flex items-center gap-5 text-success mb-6">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                        <span class="tactical-title text-sm tracking-[0.3em] uppercase">SUPPLY_CHAIN_ADVISORY</span>
                     </div>
                     <p class="mono-xs text-slate-500 leading-loose font-black tracking-widest italic">
                        "Primary dependency tree is verified against sovereign hash-registry. One vulnerable package detected in simulation sandbox. Isolation recommended."
                     </p>
                  </div>
               </div>
            </div>
            
            <button class="t-btn success w-full justify-center py-6 text-[10px] font-black group border-2 uppercase tracking-[0.4em] shadow-success/10">
               <svg class="mr-4 group-hover:rotate-180 transition-transform duration-700" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
               Initiate_Deep_Rescan
            </button>
         </div>
      </div>
    </Layout>
  );
};
