import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

/**
 * Atomic Incidents Page
 * Hardened incident response portal with CSS-driven design system.
 */
export const IncidentsPage = () => {
  const scriptContent = `
    async function loadIncidents() {
      try {
        const res = await fetch('/api/compliance/incidents');
        const incidents = await res.json();
        const container = document.getElementById('incidents-container');
        if (!container) return;
        
        if (!incidents || incidents.length === 0) {
            container.innerHTML = '<div class="glass-panel" style="padding:4rem; text-align:center; opacity:0.5;">No active security incidents.</div>';
            return;
        }

        container.innerHTML = incidents.map(i => {
            const statusColor = i.status === 'OPEN' ? 'var(--cyber-red)' : 'var(--cyber-green)';
            const severityGlow = i.severity === 'CRITICAL' ? 'var(--cyber-red-glow)' : 'var(--cyber-orange-glow)';

            return \`
                <div class="glass-panel">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:2rem;">
                        <div style="display:flex; align-items:center; gap:1.5rem;">
                            <div style="width:64px; height:64px; background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.1); border-radius:1.25rem; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 20px \${severityGlow};">
                                <div class="status-dot \${i.status === 'OPEN' ? 'critical' : 'active'} pulse"></div>
                            </div>
                            <div>
                                <h3 style="font-size:1.5rem; color:white; margin:0 0 0.5rem 0; font-style:italic;">\${i.title}</h3>
                                <div class="mono-label" style="display:flex; align-items:center; gap:1rem; opacity:0.4;">
                                    <span>ID: \${i.id.slice(0,8)}</span>
                                    <span>Source: \${i.source}</span>
                                </div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div class="mono-label" style="padding:0.5rem 1rem; border-radius:2rem; background:rgba(255,255,255,0.05); color:\${statusColor}; border:1px solid \${statusColor}; display:inline-block; margin-bottom:0.5rem;">\${i.status}</div>
                            <div class="mono-label" style="opacity:0.4;">\${new Date(i.timestamp).toLocaleString()}</div>
                        </div>
                    </div>

                    <div class="log-entry" style="background:rgba(0,0,0,0.3); padding:1.5rem; border-radius:1rem; border:1px solid var(--border-color); margin-bottom:1.5rem; color:var(--text-secondary); font-size:13px; line-height:1.6;">\${i.description}</div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:1.5rem;">
                        <div style="display:flex; gap:0.5rem;">
                            \${i.indicators.map(ind => \`<span class="mono-label" style="background:rgba(0,0,0,0.3); padding:0.4rem 0.8rem; border-radius:1rem; border:1px solid var(--border-color);">\${ind}</span>\`).join('')}
                        </div>
                        <div style="display:flex; gap:1rem;">
                            <button onclick="updateStatus('\${i.id}', 'INVESTIGATING')" class="tactical-button" style="padding:0.5rem 1.5rem;">Investigate</button>
                            <button onclick="updateStatus('\${i.id}', 'RESOLVED')" class="tactical-button" style="padding:0.5rem 1.5rem; background:var(--cyber-green); color:black; border:none;">Resolve</button>
                        </div>
                    </div>
                </div>
            \`;
        }).join('');
      } catch (err) { console.error("Incidents fetch failed", err); }
    }

    async function updateStatus(id, status) {
       await fetch(\`/api/compliance/incidents/\${id}/status\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status })
       });
       loadIncidents();
    }

    loadIncidents();
  `;

  return (
    <Layout title="Security Incidents // Response Management">
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-red); border-radius:4px; box-shadow:0 0 20px var(--cyber-red-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">SECURITY_INCIDENTS</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Incident Lifecycle Management // Active_Threat_Investigation</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">01_INCIDENT_LIFECYCLE</h2>
        <div style="display:flex; flex-direction:column; gap:1.5rem;" id="incidents-container">
           <div class="glass-panel" style="text-align:center;">
              <span class="mono-label pulse" style="opacity:0.3;">Syncing_Incident_Reports...</span>
           </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </Layout>
  );
};
