import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Scanner Agent Page
 * Vulnerability and port scanner for local network assessment.
 */
export const ScannerPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout nonce={props.nonce} title="Scanner Agent // Tactical Assessment" islandPaths={[
      '/components/islands/ScannerAgent.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>Scanner_Agent</h1>
          <span class="subtitle">Network Reconnaissance & Vulnerability Assessment // Mode: Tactical</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 t-panel glass-panel p-6 border-t-2 border-primary/30">
          <scanner-agent></scanner-agent>
        </div>
      </div>
    </Layout>
  );
};
