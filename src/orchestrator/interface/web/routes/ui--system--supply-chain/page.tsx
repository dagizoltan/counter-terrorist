import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Supply Chain Page
 * Software Bill of Materials (SBOM) and vulnerability tracking.
 */
export const SupplyChainPage = (props: { status: any, csrfToken?: string, nonce?: string, hostname?: string, userRole?: string }) => {
  const sbom = props.status.supplyChain || [];
  const secureCount = sbom.filter((d: any) => d.status === 'SECURE').length;
  const healthScore = sbom.length > 0 ? Math.round((secureCount / sbom.length) * 100) : 100;

  return (
    <Layout title="Supply Chain Audit" islandPaths={['/components/islands/SupplyChainIsland.js']} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      <header class="page-header">
        <div class="title-group">
          <h1>Supply Chain Integrity</h1>
          <span class="subtitle">Software Bill of Materials (SBOM) // Vulnerability Status: Monitoring</span>
        </div>
        <div class="flex items-center gap-4">
           <div class="flex flex-col items-end gap-1">
              <span class="eyebrow">Global Health Score</span>
              <div class="text-4xl font-black tracking-tighter text-white tabular-nums">{healthScore}%</div>
           </div>
           <div class={`w-1.5 h-16 rounded-full ${healthScore > 90 ? 'bg-success' : 'bg-warning'}`}></div>
        </div>
      </header>

      {/* SupplyChainIsland mounts into this root by id. It polls
          /api/supply-chain/status for live verification state, which the
          server-rendered inventory below has no equivalent of. */}
      <div class="grid grid-cols-12 gap-4 mb-5">
         <div class="col-span-12">
            <div id="supply-chain-container"></div>
         </div>
      </div>

      <div class="grid grid-cols-12 gap-4 mb-5">
         <div class="col-span-12 lg:col-span-4 space-y-4">
            <div class="t-panel glass-panel border-t-2 border-primary">
               <span class="metric-tag mb-4 block">Audit_Summary</span>
               <div class="space-y-4">
                  <div class="flex justify-between items-center p-3 bg-black/40 rounded-lg border border-white/5">
                     <span class="eyebrow">Total Dependencies</span>
                     <span class="text-3xl font-black text-white tracking-tighter tabular-nums">{sbom.length}</span>
                  </div>
                  <div class="flex justify-between items-center p-3 bg-black/40 rounded-lg border border-white/5">
                     <span class="eyebrow">Vulnerabilities</span>
                     <span class="text-3xl font-black text-danger tracking-tighter tabular-nums">{sbom.length - secureCount}</span>
                  </div>
               </div>
            </div>

            <div class="t-panel glass-panel border-t-2 border-slate-700">
               <span class="metric-tag mb-4 block">Integrity_Policies</span>
               <div class="space-y-4">
                  <div class="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-lg">
                     <div class="dot active"></div>
                     <span class="eyebrow">Lockfile Verification</span>
                  </div>
                  <div class="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-lg">
                     <div class="dot active"></div>
                     <span class="eyebrow">License Compliance</span>
                  </div>
                  <div class="flex items-center gap-4 p-4 bg-white/5 border border-white/5 rounded-lg opacity-40">
                     <div class="dot danger"></div>
                     <span class="eyebrow">Shadow Dependency Check</span>
                  </div>
               </div>
            </div>
         </div>

         <div class="col-span-12 lg:col-span-8">
            <div class="t-panel glass-panel p-0 border-t-2 border-slate-800 overflow-hidden">
               <header class="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
                  <h3 class="tactical-title text-base tracking-widest">DEPENDENCY MANIFEST</h3>
                  <div class="flex items-center gap-4">
                     <span class="eyebrow">Source: Real-time scan</span>
                  </div>
               </header>
               <div class="overflow-x-auto">
                  <div class="divide-y divide-white/10">
                     {['ORCHESTRATOR', 'EBPF', 'FIM', 'FIREWALL', 'DECEPTION', 'NETWORK'].map(feature => {
                        const deps = sbom.filter((d: any) => d.feature === feature);
                        if (deps.length === 0) return null;
                        return (
                           <div class="bg-black/20">
                              <div class="px-4 py-3 bg-white/5 border-y border-white/5 flex items-center gap-3">
                                 <div class={`w-1 h-3 rounded-full ${ feature === 'ORCHESTRATOR' ? 'bg-primary' : feature === 'EBPF' ? 'bg-danger' : feature === 'FIM' ? 'bg-warning' : feature === 'FIREWALL' ? 'bg-success' : 'bg-slate-500' }`}></div>
                                 <span class="eyebrow">{feature} MODULES</span>
                              </div>
                              <table class="w-full text-left">
                                 <tbody class="divide-y divide-white/5">
                                    {deps.map((dep: any) => (
                                       <tr class="hover:bg-white/[0.02] transition-colors group">
                                          <td class="p-4 w-1/3">
                                             <div class="flex flex-col">
                                                <span class="text-sm font-black text-white tracking-tight">{dep.name}</span>
                                                {dep.cve && <span class="mono-xs text-danger font-black mt-1">{dep.cve}</span>}
                                             </div>
                                          </td>
                                          <td class="p-4 mono-xs text-slate-400 font-bold w-1/6">{dep.version}</td>
                                          <td class="p-4 mono-xs text-slate-500 w-1/6">{dep.license}</td>
                                          <td class="p-4 text-right">
                                             <span class={`status-pill ${dep.status === 'SECURE' ? 'active' : 'error'} font-black tracking-widest`}>
                                                {dep.status}
                                             </span>
                                          </td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        );
                     })}
                  </div>
               </div>
            </div>
         </div>
      </div>
    </Layout>
  );
};
