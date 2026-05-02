import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";
import { HoneypotModule } from "@domain/protection/honeypot_service.ts";

/**
 * Honeypots Page
 * Deception infrastructure management.
 */
export const HoneypotsPage = (props: { modules: HoneypotModule[] }) => {
  return (
    <Layout title="Honeypot Infrastructure">
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-orange); border-radius:4px; box-shadow:0 0 20px var(--cyber-orange-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">DECEPTION_LAYER</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Multi-vector active decoys // Distributed trap network</p>
          </div>
        </div>
      </div>

      <div class="tactical-grid" style="grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));">
        {props.modules.map(module => (
          <div class="glass-panel" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:1.5rem;">
                <div class={`status-dot \${module.active ? "active" : "critical"}`} style="\${!module.active ? 'opacity:0.2;' : ''}"></div>
                <span class="mono-label" style="opacity:0.5;">Port \${module.port}</span>
              </div>
              <h3 style="font-size:1.5rem; color:white; margin:0 0 1rem 0; font-style:italic;">\${module.name}</h3>
              <p style="font-size:12px; color:var(--text-secondary); margin-bottom:2rem; line-height:1.6;">\${module.description}</p>
            </div>
            
            <div style="display:flex; gap:1rem;">
              <a href={`/honeypots/\${module.id}`} class="tactical-button" style="flex:1; text-align:center; text-decoration:none;">Inspect_Telemetry</a>
              <button 
                onclick={`fetch('/api/honeypots/\${module.id}/toggle', { method: 'POST', body: JSON.stringify({ active: \${!module.active} }), headers: { 'Content-Type': 'application/json' } }).then(() => location.reload())`}
                class={`tactical-button \${module.active ? "critical" : ""}`}
                style="flex:1;"
              >
                {module.active ? "Deactivate" : "Deploy"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
};
