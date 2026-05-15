import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Audit Integrity Page
 * Decentralized audit verification view.
 */
export default function AuditIntegrity({ status, csrfToken }: { status?: any, csrfToken?: string }) {
  return (
    <Layout nonce={props.nonce} title="Mesh Integrity // Autonomous Defense Mesh" csrfToken={props.csrfToken} >
      <div style="max-width:1200px; margin:0 auto;">
        <header style="margin-bottom:3rem;">
          <div class="section-header">System Security</div>
          <h1 style="font-size:3.5rem; color:white; margin:0 0 1rem 0; font-style:italic;">
            MESH_INTEGRITY
          </h1>
          <p style="font-size:14px; font-weight:500; color:var(--text-secondary); line-height:1.6; max-width:800px;">
            Decentralized audit verification. The defense mesh uses a tamper-evident SHA-256 hash chain to ensure all security events are immutable and verified across the cluster.
          </p>
        </header>

        <div id="integrity-island-container" class="glass-panel" style="min-height:400px; display:flex; align-items:center; justify-content:center;">
           <span class="mono-label" style="opacity:0.3;">Initializing_Integrity_Chain_Validator...</span>
        </div>
      </div>

      <script type="module" dangerouslySetInnerHTML={{ __html: `
        import { h, render } from '/vendor/preact.js';
        import IntegrityIsland from '/components/islands/IntegrityIsland.js';
        
        const container = document.getElementById('integrity-island-container');
        if (container) {
          container.innerHTML = ''; // Clear loader
          render(h(IntegrityIsland), container);
        }
      `}} />
    </Layout>
  );
}
