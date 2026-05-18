import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { LogViewer } from "./components/LogViewer.tsx";

export const PageHeader = ({ title, subtitle, color = "var(--cyber-blue)" }: any) => (
  <div style="margin-bottom:3rem;">
    <div style="display:flex; align-items:center; gap:1.5rem;">
      <div style={`width:8px; height:40px; background:${color}; border-radius:4px; box-shadow:0 0 20px ${color}glow;`}></div>
      <div>
        <h1 style="font-size:2.5rem; margin:0;">{title}</h1>
        <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">{subtitle}</p>
      </div>
    </div>
  </div>
);

/**
 * Logs Page
 * Forensic internal log viewer.
 */
export const LogsPage = (props: { csrfToken?: string; nonce?: string }) => {
  return (
    <Layout title="System Logs // Forensic Audit" csrfToken={props.csrfToken} nonce={props.nonce}>
      <PageHeader
        title="SYSTEM_LOGS"
        subtitle="Orchestrator Internal Execution Stream // Global_Live_Audit"
      />

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">01_LIVE_EXECUTION_BUFFER</h2>
        <LogViewer />
      </div>
    </Layout>
  );
};
