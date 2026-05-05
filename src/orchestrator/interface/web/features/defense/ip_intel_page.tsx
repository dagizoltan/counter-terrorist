import { Layout } from "../../components/Layout.tsx";

export default function IpIntelPage(props: { status: any, csrfToken?: string }) {
    return (
       <Layout title="IP Intelligence DB // Tactical Intelligence" islandPaths={[
          '/components/islands/ThreatExplorer.js'
       ]} csrfToken={props.csrfToken}>
          <section class="p-10 space-y-10">
             <header class="flex justify-between items-end">
                <div class="space-y-4">
                   <div class="flex items-center gap-4">
                      <div class="w-12 h-0.5 bg-danger"></div>
                      <span class="mono-xs font-black text-danger uppercase tracking-[0.4em]">External_Threat_Intelligence</span>
                   </div>
                   <h1 class="text-6xl font-black text-white italic tracking-tighter uppercase leading-none">
                      Malicious <span class="text-danger">IP_DB</span>
                   </h1>
                </div>
             </header>
 
             <threat-explorer></threat-explorer>
          </section>
       </Layout>
    );
}
