import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Supply Chain Page
 * Software Bill of Materials (SBOM) and vulnerability tracking.
 */
export const SupplyChainPage = (props: { status: any, csrfToken?: string }) => {
  const sbom = props.status.supplyChain || [];
  const secureCount = sbom.filter((d: any) => d.status === 'SECURE').length;
  const healthScore = sbom.length > 0 ? Math.round((secureCount / sbom.length) * 100) : 100;

  return (
    <Layout title="Supply Chain Audit" islandPaths={[]} csrfToken={props.csrfToken}>
      <header class="page-header">
        <div class="title-group">
          <h1>Supply Chain Integrity</h1>
          <span class="subtitle">Software Bill of Materials (SBOM) // Vulnerability Status: Monitoring</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="flex flex-col items-end gap-1">
              <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Global Health Score</span>
              <div class="text-4xl font-black italic tracking-tighter text-white tabular-nums">{healthScore}%</div>
           </div>
           <div class={`w-1.5 h-16 rounded-full ${healthScore > 90 ? 'bg-success' : 'bg-warning'}`}></div>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-12">
         <div class="col-span-12 lg:col-span-4 space-y-6">
            <div class="t-panel glass-panel border-t-2 border-primary">
               <span class="metric-tag mb-8 block">Audit_Summary</span>
               <div class="space-y-6">
                  <div class="flex justify-between items-center p-5 bg-black/40 rounded-xl border border-white/5">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Total Dependencies</span>
                     <span class="text-3xl font-black text-white italic tracking-tighter tabular-nums">{sbom.length}</span>
                  </div>
                  <div class="flex justify-between items-center p-5 bg-black/40 rounded-xl border border-white/5">
                     <span class="mono-xs text-slate-500 font-black uppercase tracking-widest">Vulnerabilities</span>
                     <span class="text-3xl font-black text-danger italic tracking-tighter tabular-nums">{sbom.length - secureCount}</span>
                  </div>
               </div>
            </div>

            <div class="t-panel glass-panel border-t-2 border-slate-700">
               <span class="metric-tag mb-8 block">Integrity_Policies</span>
               <div class="space-y-4">
                  <div class="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-xl">
                     <div class="dot active"></div>
                     <span class="mono-xs text-slate-400 font-bold uppercase tracking-widest">Lockfile Verification</span>
                  </div>
                  <div class="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-xl">
                     <div class="dot active"></div>
                     <span class="mono-xs text-slate-400 font-bold uppercase tracking-widest">License Compliance</span>
                  </div>
                  <div class="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-xl opacity-40">
                     <div class="dot danger"></div>
                     <span class="mono-xs text-slate-400 font-bold uppercase tracking-widest">Shadow Dependency Check</span>
                  </div>
               </div>
            </div>
         </div>

         <div class="col-span-12 lg:col-span-8">
            <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 overflow-hidden">
               <header class="p-6 border-b border-white/10 flex justify-between items-center bg-black/40">
                  <h3 class="tactical-title text-base tracking-widest">DEPENDENCY MANIFEST</h3>
                  <div class="flex items-center gap-4">
                     <span class="mono-xs text-slate-600 font-bold uppercase">Source: Real-time scan</span>
                  </div>
               </header>
               <div class="overflow-x-auto">
                  <table class="w-full text-left">
                     <thead>
                        <tr class="border-b border-white/5 bg-black/20">
                           <th class="p-6 mono-xs text-slate-500 font-black uppercase tracking-widest">NAME</th>
                           <th class="p-6 mono-xs text-slate-500 font-black uppercase tracking-widest">VERSION</th>
                           <th class="p-6 mono-xs text-slate-500 font-black uppercase tracking-widest">LICENSE</th>
                           <th class="p-6 mono-xs text-slate-500 font-black uppercase tracking-widest">STATUS</th>
                        </tr>
                     </thead>
                     <tbody class="divide-y divide-white/5">
                        {sbom.map((dep: any) => (
                           <tr class="hover:bg-white/[0.02] transition-colors group">
                              <td class="p-6">
                                 <div class="flex flex-col">
                                    <span class="text-sm font-black text-white italic tracking-tight">{dep.name}</span>
                                    {dep.cve && <span class="mono-xs text-danger font-black mt-1">{dep.cve}</span>}
                                 </div>
                              </td>
                              <td class="p-6 mono-xs text-slate-400 font-bold">{dep.version}</td>
                              <td class="p-6 mono-xs text-slate-500">{dep.license}</td>
                              <td class="p-6">
                                 <span class={`status-pill ${dep.status === 'SECURE' ? 'active' : 'error'} px-4 py-1 text-[9px] font-black tracking-widest`}>
                                    {dep.status}
                                 </span>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
         </div>
      </div>
    </Layout>
  );
};
