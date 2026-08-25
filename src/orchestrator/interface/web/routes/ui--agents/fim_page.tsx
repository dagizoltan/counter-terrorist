import { jsx as _jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * FIM Agent Page
 * File Integrity Monitoring and real-time filesystem auditing.
 */
export const FimPage = (props: { status: unknown, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout title="FIM Agent // Integrity Audit" islandPaths={[
      '/components/islands/FimAgent.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>FIM_Agent</h1>
          <span class="subtitle">File Integrity Monitoring & Real-time Auditing // Status: Monitoring</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-4 mb-4">
        <div class="col-span-12 t-panel glass-panel p-4 border-t-2 border-primary/30">
          <fim-agent></fim-agent>
        </div>
      </div>
    </Layout>
  );
};
