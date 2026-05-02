import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

/**
 * Atomic Audit Page
 * Hardened forensic ledger with CSS-driven design system.
 */
export const AuditPage = () => {
  const scriptContent = `
    async function loadCompliance() {
        try {
            const res = await fetch('/api/compliance/snapshot');
            const data = await res.json();
            const container = document.getElementById('compliance-snapshot');
            if (!container) return;
            
            const statusColor = data.overallStatus === 'COMPLIANT' ? 'var(--cyber-green)' : 'var(--cyber-red)';
            const statusBg = data.overallStatus === 'COMPLIANT' ? 'var(--cyber-green-glow)' : 'var(--cyber-red-glow)';

            container.innerHTML = \`
                <div class="glass-panel" style="background:\${statusBg};">
                    <span class="mono-label" style="opacity:0.5; margin-bottom:0.5rem;">Overall_Status</span>
                    <span style="font-size:1.5rem; font-weight:900; color:\${statusColor}; font-style:italic;">\${data.overallStatus}</span>
                </div>
                <div class="glass-panel">
                    <span class="mono-label" style="opacity:0.5; margin-bottom:0.5rem;">Integrity_Score</span>
                    <span style="font-size:1.5rem; font-weight:900; color:white;">\${data.integrityScore}%</span>
                </div>
                <div class="glass-panel">
                    <span class="mono-label" style="opacity:0.5; margin-bottom:0.5rem;">Tamper_Attempts</span>
                    <span style="font-size:1.5rem; font-weight:900; color:\${data.metrics.tamperAttempts > 0 ? 'var(--cyber-red)' : 'white'};">\${data.metrics.tamperAttempts}</span>
                </div>
                <div class="glass-panel">
                    <span class="mono-label" style="opacity:0.5; margin-bottom:0.5rem;">Admin_Actions</span>
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
        if (!container) return;
        
        if (!events || events.length === 0) {
          container.innerHTML = '<div class="glass-panel" style="padding:4rem; text-align:center; opacity:0.5;">Audit ledger is empty.</div>';
          return;
        }

        container.innerHTML = events.map(e => \`
          <div class="glass-panel" style="margin-bottom:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid var(--border-color); padding-bottom:1.5rem;">
               <div style="display:flex; align-items:center; gap:1rem;">
                  <span class="mono-label" style="padding:0.5rem 1rem; background:rgba(255,255,255,0.05); border-radius:2rem;">\${e.type}</span>
                  <span style="font-size:1.1rem; font-weight:900; color:white;">\${e.message}</span>
               </div>
               <div style="text-align:right;">
                  <div class="mono-label" style="opacity:0.4;">\${new Date(e.timestamp).toLocaleString()}</div>
                  \${e.actor ? \`<div class="mono-label" style="color:var(--cyber-green); margin-top:0.25rem;">\${e.actor.id} @ \${e.actor.ip}</div>\` : ''}
               </div>
            </div>

            <div style="display:flex; flex-direction:column; gap:1rem;">
               <div style="display:flex; flex-direction:column; gap:0.5rem;">
                  <span class="mono-label" style="opacity:0.3;">Cryptographic_Hash</span>
                  <div class="log-entry" style="border:1px solid var(--border-color); border-radius:0.5rem; word-break:break-all;">\${e.hash}</div>
               </div>
               \${e.hwSignature ? \`
               <div style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; background:var(--cyber-green-glow); border:1px solid rgba(16,185,129,0.2); border-radius:0.5rem; width:fit-content;">
                  <span class="mono-label" style="color:var(--cyber-green);">Hardware_Signed</span>
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
          <div style="width:8px; height:40px; background:var(--cyber-green); border-radius:4px; box-shadow:0 0 20px var(--cyber-green-glow);"></div>
          <div>
            <h1 style="font-size:2.5rem; margin:0;">AUDIT_LEDGER</h1>
            <p class="mono-label" style="color:var(--text-muted); margin-top:0.25rem;">Immutable Hash-Chained Event History // Forensic_Integrity_Chain</p>
          </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <h2 class="section-header">00_REAL_TIME_COMPLIANCE_SNAPSHOT</h2>
        <div id="compliance-snapshot" class="tactical-grid" style="grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));">
           <div class="glass-panel" style="text-align:center;">
              <span class="mono-label pulse" style="opacity:0.3;">Analyzing_System_Integrity...</span>
           </div>
        </div>
      </div>

      <div style="margin-bottom:3rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
          <h2 class="section-header">01_CRYPTOGRAPHIC_CHAIN_VERIFICATION</h2>
          <button 
            onclick="exportBundle()"
            class="tactical-button"
            style="background:var(--cyber-green); color:black; border:none;"
          >
            Export_Signed_Bundle
          </button>
        </div>
        <div style="display:flex; flex-direction:column; gap:1rem;" id="audit-events">
            <div class="glass-panel" style="padding:4rem; text-align:center; font-style:italic;">
                <span class="mono-label pulse" style="opacity:0.3;">Verifying_Cryptographic_Chain_Integrity...</span>
            </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </Layout>
  );
};
