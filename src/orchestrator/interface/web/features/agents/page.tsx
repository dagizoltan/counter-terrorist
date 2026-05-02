import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * Atomic Agents Page
 * Hardened agent management with zero-class dependency.
 */
export const AgentsPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const { plugins } = props.status;

  const styles = {
    card: "padding:2rem; border-radius:1.5rem; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.05); position:relative; overflow:hidden;",
    headerLine: "width:8px; height:40px; background:#0ea5e9; border-radius:4px; box-shadow:0 0 20px rgba(14,165,233,0.3);",
    badge: "padding:0.4rem 0.75rem; border-radius:2rem; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:0.1em;",
    grid: "display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:2rem;",
    label: "font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.5em; color:rgba(148,163,184,0.4); display:flex; align-items:center; gap:1rem; margin-bottom:2rem;"
  };

  return (
    <Layout title="Agents" islandPaths={[
      '/components/islands/AgentCardIsland.js', 
      '/components/islands/MetricsHydrator.js',
      '/components/islands/SupplyChainIsland.js'
    ]} csrfToken={props.csrfToken}>
      
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style={styles.headerLine}></div>
          <div>
            <h1 style="font-size:2.5rem; font-weight:900; letter-spacing:-0.05em; text-transform:uppercase; margin:0;">DEFENSE_AGENTS</h1>
            <p style="font-size:10px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.4em; margin-top:0.25rem;">Orchestrated Security Sidecars // Active Enforcers // Mesh_Intelligence</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:4rem;">
        <h2 style={styles.label}>
          <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
          01_ENDPOINT_REGISTRY
        </h2>
        <div style={styles.grid}>
          {plugins.map((agent) => (
            <div style={styles.card}>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                  <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div style="width:10px; height:10px; border-radius:50%; background:#0ea5e9; box-shadow:0 0 10px #0ea5e9;"></div>
                    <h3 style="font-size:1.25rem; font-weight:900; color:white; margin:0; text-transform:uppercase; italic;">\${agent.name}</h3>
                  </div>
                  <div style={styles.badge + (agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? ' background:rgba(16,185,129,0.1); color:#10b981;' : ' background:rgba(239,68,68,0.1); color:#ef4444;')}>
                    {agent.status}
                  </div>
                </div>

                <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.05); border-radius:1.5rem; padding:1.5rem; margin-bottom:1.5rem;">
                   <agent-card-island agent={agent.name}></agent-card-island>
                </div>

                <p style="font-size:10px; color:rgba(148,163,184,0.6); font-weight:900; text-transform:uppercase; margin-bottom:2rem; line-height:1.5;">
                  {agent.description || "Active security sidecar providing autonomous enforcement and real-time mesh telemetry."}
                </p>

                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:1.5rem;">
                  <a href={`/agents/${agent.name}`} style="font-size:10px; font-weight:900; color:#0ea5e9; text-decoration:none; text-transform:uppercase; letter-spacing:0.1em;">Open_Console</a>
                  <div style="display:flex; gap:1rem;">
                      <div style="width:32px; height:32px; background:rgba(255,255,255,0.05); border-radius:0.5rem; display:flex; align-items:center; justify-content:center; color:#94a3b8; cursor:pointer;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                      </div>
                  </div>
                </div>
            </div>
          ))}
        </div>
      </div>

      {/* HARDENING MATRIX */}
      <div style="margin-bottom:4rem;">
        <h2 style={styles.label}>
          <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
          02_HARDENING_MATRIX
        </h2>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1.5rem;">
           {[
             { id: 'stat-kernel-aslr', label: 'ASLR_PROTECTION', desc: 'Layout Randomization' },
             { id: 'stat-kernel-syncookies', label: 'SYN_COOKIES', desc: 'Flood Mitigation' },
             { id: 'stat-kernel-rpfilter', label: 'RP_FILTER', desc: 'Source Validation' },
             { id: 'stat-anon-mode', label: 'ANONYMIZATION', desc: 'Stealth Provider' },
             { id: 'stat-audit-chain', label: 'AUDIT_INTEGRITY', desc: 'Immutable Logs' }
           ].map(item => (
             <div style={styles.card + " padding:1.5rem;"}>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                  <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.4); text-transform:uppercase; letter-spacing:0.1em;">{item.label}</span>
                  <div style="width:6px; height:6px; background:#10b981; border-radius:50%;"></div>
                </div>
                <div id={item.id} style="font-size:1.25rem; font-weight:900; color:white; font-style:italic; margin-bottom:0.25rem;">LOADING...</div>
                <p style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.3); text-transform:uppercase; margin:0;">{item.desc}</p>
             </div>
           ))}
        </div>
      </div>

      <div style="margin-top:4rem;">
        <h2 style={styles.label}>
          <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
          03_SUPPLY_CHAIN_INTEGRITY
        </h2>
        <div id="supply-chain-container" style="background:rgba(15,23,42,0.4); border-radius:2rem; border:1px solid rgba(255,255,255,0.05); padding:3rem; text-align:center;">
            <div style="font-size:11px; font-weight:900; text-transform:uppercase; color:rgba(148,163,184,0.3);">Initializing_Supply_Chain_Validator...</div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
