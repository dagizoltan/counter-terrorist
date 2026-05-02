import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

/**
 * Atomic Audit Page
 * Hardened forensic ledger with atomic style injection for dynamic events.
 */
export const AuditPage = () => {
  const scriptContent = `
    const atomicStyles = {
        card: "padding:2rem; border-radius:1.5rem; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; position:relative; overflow:hidden;",
        badge: "padding:0.5rem 1rem; border-radius:2rem; font-size:9px; font-weight:900; text-transform:uppercase; letter-spacing:0.1em; font-family:monospace;",
        hash: "font-family:monospace; font-size:10px; color:rgba(148,163,184,0.5); background:rgba(0,0,0,0.4); padding:0.5rem 1rem; border-radius:0.5rem; border:1px solid rgba(255,255,255,0.05); word-break:break-all;"
    };

    async function loadCompliance() {
        try {
            const res = await fetch('/api/compliance/snapshot');
            const data = await res.json();
            const container = document.getElementById('compliance-snapshot');
            
            const statusColor = data.overallStatus === 'COMPLIANT' ? '#10b981' : '#ef4444';
            const statusBg = data.overallStatus === 'COMPLIANT' ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)';

            container.innerHTML = \`
                <div style="\${atomicStyles.card} background:\${statusBg};">
                    <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.5rem;">Overall_Status</span>
                    <span style="font-size:1.5rem; font-weight:900; color:\${statusColor}; text-transform:uppercase; font-style:italic;">\${data.overallStatus}</span>
                </div>
                <div style="\${atomicStyles.card}">
                    <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.5rem;">Integrity_Score</span>
                    <span style="font-size:1.5rem; font-weight:900; color:white;">\${data.integrityScore}%</span>
                </div>
                <div style="\${atomicStyles.card}">
                    <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.5rem;">Tamper_Attempts</span>
                    <span style="font-size:1.5rem; font-weight:900; color:\${data.metrics.tamperAttempts > 0 ? '#ef4444' : 'white'};">\${data.metrics.tamperAttempts}</span>
                </div>
                <div style="\${atomicStyles.card}">
                    <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:0.5rem;">Admin_Actions</span>
                    <span style="font-size:1.5rem; font-weight:900; color:white;">\${data.metrics.adminActions}</span>
                </div>
            \`;
        } catch (err) { console.error("Compliance fetch failed", err); }
    }

    async function loadAudit() {
      try {
        const eventsRes = await fetch('/api/audit/logs'); 
        const events = await eventsRes.json();
        const container = document.getElementById('audit-events');
        
        if (!events || events.length === 0) {
          container.innerHTML = '<div style="padding:4rem; text-align:center; opacity:0.5;">Audit ledger is empty.</div>';
          return;
        }

        container.innerHTML = events.map(e => \`
          <div style="\${atomicStyles.card} margin-bottom:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:1.5rem;">
               <div style="display:flex; align-items:center; gap:1rem;">
                  <span style="\${atomicStyles.badge} background:rgba(255,255,255,0.05); color:#94a3b8;">\${e.type}</span>
                  <span style="font-size:1.1rem; font-weight:900; color:white; text-transform:uppercase;">\${e.message}</span>
               </div>
               <div style="text-align:right;">
                  <div style="font-size:9px; font-weight:700; color:rgba(148,163,184,0.4); font-family:monospace;">\${new Date(e.timestamp).toLocaleString()}</div>
                  \${e.actor ? \`<div style="font-size:8px; font-weight:900; color:#10b981; text-transform:uppercase; letter-spacing:0.1em; margin-top:0.25rem;">\${e.actor.id} @ \${e.actor.ip}</div>\` : ''}
               </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:1rem;">
               <div style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span style="font-size:8px; font-weight:900; color:rgba(148,163,184,0.3); text-transform:uppercase;">Cryptographic_Hash</span>
                  <div style="\${atomicStyles.hash}">\${e.hash}</div>
               </div>
               \${e.hwSignature ? \`
               <div style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.2); border-radius:0.5rem; width:fit-content;">
                  <span style="font-size:8px; font-weight:900; color:#10b981; text-transform:uppercase;">Hardware_Signed</span>
               </div>
               \` : ''}
            </div>
          </div>
        \`).join('');
      } catch(err) { console.error("Audit fetch failed", err); }
    }

    async function exportBundle() {
        const res = await fetch('/api/compliance/export');
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ghost-compliance-export.json';
        a.click();
    }

    loadCompliance();
    loadAudit();
  `;

  return (
    <Layout title="Compliance Audit Ledger // Chain of Custody">
      <div style="margin-bottom:3rem;">
        <div style="display:flex; align-items:center; gap:1.5rem;">
          <div style="width:8px; height:40px; background:#10b981; border-radius:4px; box-shadow:0 0 20px rgba(16,185,129,0.3);"></div>
          <div>
            <h1 style="font-size:2.5rem; font-weight:900; letter-spacing:-0.05em; text-transform:uppercase; margin:0;">AUDIT_LEDGER</h1>
            <p style="font-size:10px; font-weight:900; color:rgba(148,163,184,0.5); text-transform:uppercase; letter-spacing:0.4em; margin-top:0.25rem;">Immutable Hash-Chained Event History // Forensic_Integrity_Chain</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.5em; color:rgba(148,163,184,0.4); display:flex; align-items:center; gap:1rem; margin-bottom:1.5rem;">
          <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
          00_REAL_TIME_COMPLIANCE_SNAPSHOT
        </h2>
        <div id="compliance-snapshot" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:1.5rem;">
           <div style="padding:2rem; border-radius:1.5rem; background:rgba(15,23,42,0.4); border:1px solid rgba(255,255,255,0.05); text-align:center; font-weight:900; text-transform:uppercase; font-size:9px; color:rgba(148,163,184,0.4);">
              Analyzing_System_Integrity...
           </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
          <h2 style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:0.5em; color:rgba(148,163,184,0.4); display:flex; align-items:center; gap:1rem;">
            <div style="width:32px; height:1px; background:rgba(255,255,255,0.1);"></div>
            01_CRYPTOGRAPHIC_CHAIN_VERIFICATION
          </h2>
          <button 
            onclick="exportBundle()"
            style="padding:0.75rem 1.5rem; border-radius:1rem; background:#10b981; color:black; font-size:10px; font-weight:900; text-transform:uppercase; letter-spacing:0.1em; cursor:pointer; border:none;"
          >
            Export_Signed_Bundle
          </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:1rem;" id="audit-events">
            <div style="padding:4rem; border-radius:2rem; background:rgba(15,23,42,0.4); border:1px solid rgba(255,255,255,0.05); text-align:center; font-weight:900; text-transform:uppercase; font-size:11px; color:rgba(148,163,184,0.3); font-style:italic;">
                Verifying_Cryptographic_Chain_Integrity...
            </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </Layout>
  );
};
