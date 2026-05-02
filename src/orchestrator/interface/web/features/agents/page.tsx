import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { ApplicationStatus } from "@core/ports.ts";

/**
 * Atomic Agents Page
 * Hardened agent management with CSS-driven design system.
 */
export const AgentsPage = (props: { status: ApplicationStatus, csrfToken?: string }) => {
  const { plugins } = props.status;

  return (
    <Layout title="Agents" islandPaths={[
      '/components/islands/AgentCardIsland.js', 
      '/components/islands/MetricsHydrator.js',
      '/components/islands/SupplyChainIsland.js'
    ]} csrfToken={props.csrfToken}>
      
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-blue); border-radius:4px; box-shadow:0 0 20px var(--cyber-blue-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">DEFENSE_AGENTS</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Orchestrated Security Sidecars // Active Enforcers // Mesh_Intelligence</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:4rem;">
        <h2 class="section-header">01_ENDPOINT_REGISTRY</h2>
        <div class="tactical-grid" style="grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));">
          {plugins.map((agent) => (
            <div class="glass-panel">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
                  <div style="display:flex; align-items:center; gap:0.75rem;">
                    <div class="status-dot active pulse"></div>
                    <h3 style="font-size:1.25rem; color:white; margin:0; font-style:italic;">{agent.name}</h3>
                  </div>
                  <div class={`mono-label`} style={`padding:0.4rem 0.75rem; border-radius:2rem; background:${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'var(--cyber-green-glow)' : 'var(--cyber-red-glow)'}; color:${agent.status === 'ACTIVE' || agent.status === 'RUNNING' ? 'var(--cyber-green)' : 'var(--cyber-red)'};`}>
                    {agent.status}
                  </div>
                </div>

                <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:1.5rem; padding:1.5rem; margin-bottom:1.5rem;">
                   <agent-card-island agent={agent.name}></agent-card-island>
                </div>

                <p style="font-size:10px; color:var(--text-secondary); font-weight:900; text-transform:uppercase; margin-bottom:2rem; line-height:1.5; opacity:0.8;">
                  {agent.description || "Active security sidecar providing autonomous enforcement and real-time mesh telemetry."}
                </p>

                <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:1.5rem;">
                  <a href={`/agents/${agent.name}`} class="mono-label" style="color:var(--cyber-blue); text-decoration:none;">Open_Console</a>
                  <div style="display:flex; gap:1rem;">
                      <div style="width:32px; height:32px; background:var(--border-color); border-radius:0.5rem; display:flex; align-items:center; justify-content:center; color:var(--text-secondary); cursor:pointer;">
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
        <h2 class="section-header">02_HARDENING_MATRIX</h2>
        <div class="tactical-grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1.5rem;">
           {[
             { id: 'stat-kernel-aslr', label: 'ASLR_PROTECTION', desc: 'Layout Randomization' },
             { id: 'stat-kernel-syncookies', label: 'SYN_COOKIES', desc: 'Flood Mitigation' },
             { id: 'stat-kernel-rpfilter', label: 'RP_FILTER', desc: 'Source Validation' },
             { id: 'stat-anon-mode', label: 'ANONYMIZATION', desc: 'Stealth Provider' },
             { id: 'stat-audit-chain', label: 'AUDIT_INTEGRITY', desc: 'Immutable Logs' }
           ].map(item => (
             <div class="glass-panel" style="padding:1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                  <span class="mono-label" style="font-size:8px; opacity:0.4;">{item.label}</span>
                  <div class="status-dot active"></div>
                </div>
                <div id={item.id} style="font-size:1.25rem; font-weight:900; color:white; font-style:italic; margin-bottom:0.25rem;">LOADING...</div>
                <p class="mono-label" style="font-size:8px; opacity:0.3;">{item.desc}</p>
             </div>
           ))}
        </div>
      </div>

      <div style="margin-top:4rem;">
        <h2 class="section-header">03_SUPPLY_CHAIN_INTEGRITY</h2>
        <div id="supply-chain-container" class="glass-panel" style="padding:3rem; text-align:center; background:rgba(0,0,0,0.2);">
            <div class="mono-label pulse" style="opacity:0.3;">Initializing_Supply_Chain_Validator...</div>
        </div>
      </div>

      <metrics-hydrator></metrics-hydrator>
    </Layout>
  );
};
