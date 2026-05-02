import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

/**
 * Atomic Incidents Page
 * Hardened incident response portal with zero-class dependency and atomic injection.
 */
export const IncidentsPage = () => {
  const scriptContent = `
    const atomicStyles = {
        card: "padding:2.5rem; border-radius:2rem; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; position:relative; overflow:hidden;",
        badge: "padding:0.5rem 1rem; border-radius:2rem; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:0.1em;",
        descriptionBox: "background:rgba(0,0,0,0.3); padding:1.5rem; border-radius:1rem; border:1px solid rgba(255,255,255,0.05); margin-bottom:1.5rem; color:#94a3b8; font-size:13px; line-height:1.6;",
        btn: "padding:0.75rem 1.5rem; border-radius:1rem; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.1em; cursor:pointer; border:1px solid transparent; transition:all 0.3s;"
    };

    async function loadIncidents() {
      try {
        const res = await fetch('/api/compliance/incidents');
        const incidents = await res.json();
        const container = document.getElementById('incidents-container');
        
        if (!incidents || incidents.length === 0) {
            container.innerHTML = '<div style="padding:4rem; text-align:center; opacity:0.5;">No active security incidents.</div>';
            return;
        }

        container.innerHTML = incidents.map(i => {
            const statusColor = i.status === 'OPEN' ? '#ef4444' : '#10b981';
            const severityGlow = i.severity === 'CRITICAL' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)';

            return \`
                <div style="\${atomicStyles.card}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:2rem;">
                        <div style="display:flex; align-items:center; gap:1.5rem;">
                            <div style="width:64px; height:64px; background:rgba(239,68,68,0.05); border:1px solid rgba(239,68,68,0.1); border-radius:1.25rem; display:flex; align-items:center; justify-content:center; box-shadow: 0 0 20px \${severityGlow};">
                                <div style="width:12px; height:12px; background:\${statusColor}; border-radius:50%;"></div>
                            </div>
                            <div>
                                <h3 style="font-size:1.5rem; font-weight:900; color:white; text-transform:uppercase; margin:0 0 0.5rem 0; font-style:italic;">\${i.title}</h3>
                                <div style="display:flex; align-items:center; gap:1rem; font-size:9px; font-weight:900; color:rgba(148,163,184,0.4); text-transform:uppercase; letter-spacing:0.1em;">
                                    <span>ID: \${i.id.slice(0,8)}</span>
                                    <span>Source: \${i.source}</span>
                                </div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="\${atomicStyles.badge} background:rgba(255,255,255,0.05); color:\${statusColor}; border:1px solid \${statusColor}44; display:inline-block; margin-bottom:0.5rem;">\${i.status}</div>
                            <div style="font-size:9px; font-weight:700; color:rgba(148,163,184,0.4); font-family:monospace;">\${new Date(i.timestamp).toLocaleString()}</div>
                        </div>
                    </div>

                    <div style="\${atomicStyles.descriptionBox}">\${i.description}</div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.05); padding-top:1.5rem;">
                        <div style="display:flex; gap:0.5rem;">
                            \${i.indicators.map(ind => \`<span style="\${atomicStyles.badge} background:rgba(0,0,0,0.3); color:#94a3b8; border:1px solid rgba(255,255,255,0.05);">\${ind}</span>\`).join('')}
                        </div>
                        <div style="display:flex; gap:1rem;">
                            <button onclick="updateStatus('\${i.id}', 'INVESTIGATING')" style="\${atomicStyles.btn} background:rgba(255,255,255,0.05); color:white;">Investigate</button>
                            <button onclick="updateStatus('\${i.id}', 'RESOLVED')" style="\${atomicStyles.btn} background:#10b981; color:black;">Resolve</button>
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
          <div style="width:8px; height:40px; background:#ef4444; border-radius:4px; box-shadow:0 0 20px rgba(239,68,68,0.3);"></div>
          <div>
            <h1 style="font-size:2.5rem; font-weight:900; letter-spacing:-0.05em; text-transform:uppercase; margin:0;">SECURITY_INCIDENTS</h1>
            <p style="font-size:10px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.4em; margin-top:0.25rem;">Incident Lifecycle Management // Active_Threat_Investigation</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.5em; color:rgba(148,163,184,0.4); display:flex; align-items:center; gap:1rem; margin-bottom:1.5rem;">
          <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
          01_INCIDENT_LIFECYCLE
        </h2>
        <div style="display:flex; flex-direction:column; gap:1.5rem;" id="incidents-container">
           <div style="padding:4rem; border-radius:2rem; background:rgba(15,23,42,0.4); border:1px solid rgba(255,255,255,0.05); text-align:center; font-weight:900; text-transform:uppercase; font-size:11px; color:rgba(148,163,184,0.3); font-style:italic;">
              Syncing_Incident_Reports...
           </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </Layout>
  );
};
