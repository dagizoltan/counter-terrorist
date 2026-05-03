import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AuditPage = (props: { csrfToken?: string }) => {
  const scriptContent = `
    const CSRF_TOKEN = "${props.csrfToken || ''}";

    async function loadCompliance() {
        try {
            const res = await fetch('/api/compliance/snapshot', {
              headers: { 'X-CT-Token': CSRF_TOKEN }
            });
            const data = await res.json();
            const container = document.getElementById('compliance-snapshot');
            if (!container) return;
            
            container.innerHTML = \`
                <div class="col-span-12 lg:col-span-3 t-panel glass-panel border-t-2 \${data.overallStatus === 'COMPLIANT' ? 'border-success' : 'border-danger'} transition-all hover:translate-y-[-2px]">
                    <span class="metric-tag">System_Posture</span>
                    <span class="text-4xl font-black tabular-nums tracking-tighter leading-none block mt-2 \${data.overallStatus === 'COMPLIANT' ? 'text-success' : 'text-danger'}">\${data.overallStatus}</span>
                </div>
                <div class="col-span-12 lg:col-span-3 t-panel glass-panel border-t-2 border-primary transition-all hover:translate-y-[-2px]">
                    <span class="metric-tag">Integrity_Index</span>
                    <span class="text-4xl font-black tabular-nums tracking-tighter leading-none block mt-2 text-white">\${data.integrityScore}%</span>
                </div>
                <div class="col-span-12 lg:col-span-3 t-panel glass-panel border-t-2 \${data.metrics.tamperAttempts > 0 ? 'border-danger shadow-danger/20' : 'border-slate-800'} transition-all hover:translate-y-[-2px]">
                    <span class="metric-tag">Tamper_Signals</span>
                    <span class="text-4xl font-black tabular-nums tracking-tighter leading-none block mt-2 \${data.metrics.tamperAttempts > 0 ? 'text-danger' : 'text-white'}">\${data.metrics.tamperAttempts}</span>
                </div>
                <div class="col-span-12 lg:col-span-3 t-panel glass-panel border-t-2 border-slate-800 transition-all hover:translate-y-[-2px]">
                    <span class="metric-tag">Admin_Mutations</span>
                    <span class="text-4xl font-black tabular-nums tracking-tighter leading-none block mt-2 text-white">\${data.metrics.adminActions}</span>
                </div>
            \`;
        } catch (err) { console.error("Compliance fetch failed", err); }
    }

    async function loadAudit() {
      try {
        const eventsRes = await fetch('/api/audit/logs', {
           headers: { 'X-CT-Token': CSRF_TOKEN }
        }); 
        const events = await eventsRes.json();
        const container = document.getElementById('audit-events');
        if (!container) return;
        
        if (!events || events.length === 0) {
          container.innerHTML = \`
            <div class="t-panel glass-panel border-dashed opacity-50 p-24 text-center">
              <span class="mono-xs font-black uppercase tracking-widest text-slate-500">Audit ledger is currently empty.</span>
            </div>
          \`;
          return;
        }

        container.innerHTML = events.map(e => {
          const isCritical = e.severity >= 8;
          const theme = isCritical ? 'danger' : 'primary';
          const color = \`var(--\${theme})\`;
          
          return \`
            <div class="t-panel glass-panel border-l-4 animate-fade-in group hover:bg-white/[0.02] transition-all" style="border-left-color: \${color}">
              <div class="flex justify-between items-start mb-6 pb-6 border-b border-white/5">
                 <div class="flex items-center gap-6">
                    <div class="flex flex-col gap-1">
                       <div class="flex items-center gap-2">
                         <span class="dot active shadow-\${theme}"></span>
                         <span class="mono-xs font-black tracking-widest uppercase" style="color: \${color}">\${e.type}</span>
                       </div>
                       <h3 class="text-2xl font-black text-white tracking-tighter uppercase leading-none mt-2 group-hover:text-primary transition-colors">\${e.message}</h3>
                    </div>
                 </div>
                 <div class="text-right flex flex-col items-end gap-1">
                    <div class="mono-xs text-slate-600 font-bold uppercase tracking-widest tabular-nums">\${new Date(e.timestamp).toLocaleString([], {hour12:false})}</div>
                    \${e.actor ? \`<div class="mono-xs text-success font-black uppercase tracking-tight">\${e.actor.id} // \${e.actor.ip}</div>\` : ''}
                 </div>
              </div>

              <div class="grid grid-cols-12 gap-8 items-center">
                 <div class="col-span-12 lg:col-span-8">
                    <span class="metric-tag mb-2">Cryptographic_Verification_Hash</span>
                    <div class="mono-xs p-4 bg-black/60 rounded border border-white/5 text-primary/70 break-all font-bold tracking-tight select-all">\${e.hash}</div>
                 </div>
                 <div class="col-span-12 lg:col-span-4 flex justify-end">
                    \${e.hwSignature ? \`
                    <div class="flex items-center gap-3 px-4 py-2 bg-success/5 border border-success/30 rounded text-success shadow-success/10">
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                       <span class="mono-xs font-black uppercase tracking-widest">Hardware_Verified</span>
                    </div>
                    \` : \`
                    <div class="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded text-slate-600">
                       <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                       <span class="mono-xs font-black uppercase tracking-widest">Software_Signed</span>
                    </div>
                    \`}
                 </div>
              </div>
            </div>
          \`;
        }).join('');
      } catch(err) { console.error("Audit fetch failed", err); }
    }

    async function exportBundle() {
        try {
          const res = await fetch('/api/compliance/export', {
            headers: { 'X-CT-Token': CSRF_TOKEN }
          });
          const data = await res.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'ghost-compliance-export-\${new Date().toISOString().split('T')[0]}.json';
          a.click();
        } catch(e) { alert("Export failed: " + e.message); }
    }

    loadCompliance();
    loadAudit();
  `;

  return (
    <Layout title="Audit Ledger" csrfToken={props.csrfToken}>
      {/* 1. Header Section */}
      <header class="flex justify-between items-end mb-12 animate-fade-in">
        <div class="flex items-center gap-8">
          <div class="w-3 h-16 bg-success rounded shadow-success"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase">Audit_Ledger</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot active shadow-success"></span>
                <span class="mono-xs font-black text-success tracking-widest uppercase">IMMUTABLE_HASH_CHAIN_ACTIVE</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">VERIFICATION: TPM_ROOTED</div>
            </div>
          </div>
        </div>
        <div class="flex gap-4">
          <button class="t-btn" onclick="exportBundle()">
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
             Export_Signed_Bundle
          </button>
        </div>
      </header>

      {/* 2. Snapshot Summary */}
      <section class="mb-16 animate-fade-in" style="animation-delay: 100ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">00_COMPLIANCE_SNAPSHOT</h2>
        <div id="compliance-snapshot" class="grid grid-cols-12 gap-6">
           <div class="col-span-12 t-panel glass-panel text-center p-16 border-dashed opacity-30">
              <span class="mono-xs font-black animate-pulse uppercase tracking-[0.4em] text-primary">Hydrating_Integrity_Chain...</span>
           </div>
        </div>
      </section>

      {/* 3. Event Ledger Chain */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">01_EVENT_LEDGER_CHAIN</h2>
        <div id="audit-events" class="flex flex-col gap-6">
            <div class="t-panel glass-panel text-center p-16 border-dashed opacity-30">
                <span class="mono-xs font-black animate-pulse uppercase tracking-[0.4em] text-primary">Verifying_Ledger_Integrity...</span>
            </div>
        </div>
      </section>

      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </Layout>
  );
};
