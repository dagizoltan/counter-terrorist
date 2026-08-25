import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Artifact Intelligence Page // Forensic Artifacts
 * Dedicated ledger for file hashes, YARA signatures, and malware DNA.
 */
const ArtifactIntelPage = (props: { status: unknown, csrfToken?: string, nonce?: string, userRole?: string }) => {
   return (
      <Layout title="Artifact Intelligence // Forensic Artifacts" islandPaths={[
         '/components/islands/ArtifactExplorer.js'
      ]} csrfToken={props.csrfToken} nonce={props.nonce} userRole={props.userRole}>
         <section class="p-5 space-y-4 w-full">
            <header class="page-header mb-5">
               <div class="title-group">
                  <h1 class="tactical-title text-5xl">Artifact Collections</h1>
                  <span class="subtitle">Binary Forensic Intelligence // SHA-256 & YARA Registry</span>
               </div>
               <div class="flex items-center gap-4">
                  <div class="status-pill warning active">Continuous Assurance Active</div>
               </div>
            </header>

            <artifact-explorer></artifact-explorer>
         </section>
      </Layout>
   );
};

export default ArtifactIntelPage;
