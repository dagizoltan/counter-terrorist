import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Network Page
 * Perimeter access logs.
 */
export const NetworkPage = () => {
  return (
    <Layout title="Network Access Logs // Perimeter Audit">
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:var(--cyber-blue); border-radius:4px; box-shadow:0 0 20px var(--cyber-blue-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">NETWORK_ACCESS_LOGS</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Granular Traffic Telemetry // Ingress & Egress // Global_Perimeter_Audit</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">01_PERIMETER_TRAFFIC_TELEMETRY</h2>
        <div class="glass-panel" style="padding:0; overflow:hidden;">
            <div style="overflow-x:auto;">
              <table style="width:100%; text-align:left; border-collapse:collapse;">
                 <thead style="background:rgba(255,255,255,0.05); border-bottom:1px solid var(--border-color);">
                    <tr>
                       <th style="padding:1.25rem 2rem;" class="mono-label">Timestamp</th>
                       <th style="padding:1.25rem 2rem;" class="mono-label">Direction</th>
                       <th style="padding:1.25rem 2rem;" class="mono-label">Source</th>
                       <th style="padding:1.25rem 2rem;" class="mono-label">Destination</th>
                       <th style="padding:1.25rem 2rem;" class="mono-label">Protocol</th>
                       <th style="padding:1.25rem 2rem;" class="mono-label">Action</th>
                    </tr>
                 </thead>
                 <tbody id="network-logs-body">
                    <tr>
                       <td colspan="6" style="padding:5rem; text-align:center; font-style:italic;" class="mono-label">
                          Accessing_Network_Forensic_Buffer...
                       </td>
                    </tr>
                 </tbody>
              </table>
            </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function loadNetworkLogs() {
          try {
            const res = await fetch('/api/compliance/network');
            const logs = await res.json();
            const body = document.getElementById('network-logs-body');
            if (!body) return;
            
            if (!logs || logs.length === 0) {
              body.innerHTML = '<tr><td colspan="6" style="padding:5rem; text-align:center; opacity:0.3;" class="mono-label">No network traffic events recorded.</td></tr>';
              return;
            }

            body.innerHTML = logs.map(l => {
              const directionStyle = l.direction === 'INBOUND' 
                ? 'background:var(--cyber-blue-glow); color:var(--cyber-blue); border:1px solid rgba(14,165,233,0.3);' 
                : 'background:var(--cyber-green-glow); color:var(--cyber-green); border:1px solid rgba(16,185,129,0.3);';
              
              const actionStyle = l.action === 'BLOCK' || l.action === 'DENY'
                ? 'background:var(--cyber-red-glow); color:var(--cyber-red); border:1px solid rgba(239,68,68,0.3);'
                : 'background:var(--cyber-green-glow); color:var(--cyber-green); border:1px solid rgba(16,185,129,0.3);';

              return \`
                <tr style="border-bottom:1px solid var(--border-color); transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                  <td style="padding:1.25rem 2rem;" class="mono-label">\${new Date(l.timestamp).toLocaleTimeString()}</td>
                  <td style="padding:1.25rem 2rem;">
                     <span style="padding:0.25rem 0.75rem; border-radius:2rem; font-size:9px; font-weight:900; \${directionStyle}">\${l.direction}</span>
                  </td>
                  <td style="padding:1.25rem 2rem;" class="mono-label" style="color:white; opacity:0.8;">\${l.source}</td>
                  <td style="padding:1.25rem 2rem;" class="mono-label" style="color:white; opacity:0.8;">\${l.destination}</td>
                  <td style="padding:1.25rem 2rem;" class="mono-label">\${l.protocol}</td>
                  <td style="padding:1.25rem 2rem;">
                     <span style="padding:0.25rem 0.75rem; border-radius:2rem; font-size:9px; font-weight:900; \${actionStyle}">\${l.action}</span>
                  </td>
                </tr>
              \`;
            }).join('');
          } catch (e) {
            console.error("Failed to load network logs:", e);
          }
        }
        loadNetworkLogs();
        setInterval(loadNetworkLogs, 10000);
      ` }} />
    </Layout>
  );
};
