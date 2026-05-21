import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * eBPF Agent Page
 * Kernel-level observability and enforcement.
 */
export const EbpfPage = (props: { status: any, csrfToken?: string, nonce?: string }) => {
  return (
    <Layout title="eBPF Agent // Kernel Observability" islandPaths={[
      '/components/islands/EbpfAgent.js'
    ]} csrfToken={props.csrfToken} nonce={props.nonce}>
      
      <header class="page-header">
        <div class="title-group">
          <h1>eBPF_Agent</h1>
          <span class="subtitle">Kernel-level Security Enforcement & Observability // Status: Active (Fallback)</span>
        </div>
      </header>

      <div class="grid grid-cols-12 gap-6 mb-8">
        <div class="col-span-12 t-panel glass-panel p-6 border-t-2 border-danger/30">
          <ebpf-agent></ebpf-agent>
        </div>
      </div>
    </Layout>
  );
};
