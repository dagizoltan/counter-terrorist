import { Layout } from "../../components/Layout.tsx";

export default function IpIntelPage(props: { status: any, csrfToken?: string, nonce?: string, userRole?: string }) {
    return (
       <Layout title="IP Intelligence DB // Tactical Intelligence" islandPaths={[
          '/components/islands/ThreatExplorer.js'
       ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
      <section class="p-5 space-y-4 w-full">
        <header class="page-header mb-5">
          <div class="title-group">
            <h1 class="tactical-title text-5xl">Public IP Collections</h1>
            <span class="subtitle">External Threat Intelligence // Multi-Source Reputational Feed</span>
          </div>
          <div class="flex items-center gap-4">
             <div class="status-pill danger active">Perimeter Enforcement Active</div>
          </div>
        </header>

        <threat-explorer></threat-explorer>
      </section>
       </Layout>
    );
}
