import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const AuditPage = (props: { csrfToken?: string }) => {
  return (
    <Layout title="Audit Ledger" csrfToken={props.csrfToken}>
      {/* 1. Unified Page Header */}
      <header class="page-header">
        <div class="title-group">
          <h1>Audit Ledger</h1>
          <span class="subtitle">Immutable Hash Chain // Verification: TPM Rooted</span>
        </div>
        <div class="flex gap-4">
          <button class="t-btn px-8 py-4 text-[10px] font-black group" id="export-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="group-hover:translate-y-0.5 transition-transform"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Signed Bundle
          </button>
        </div>
      </header>

      {/* 2. Snapshot Summary */}
      <section class="mb-20 animate-fade-in" style="animation-delay: 100ms;">
        <div class="flex items-center gap-6 mb-10 pb-4 border-b border-white/5">
           <div class="w-12 h-1.5 bg-primary rounded-full shadow-primary"></div>
           <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">00_COMPLIANCE_SNAPSHOT</h2>
        </div>
         <div id="compliance-snapshot" class="grid grid-cols-12 gap-8">
            <div class="col-span-12 t-panel glass-panel text-center border-dashed border-white/10 opacity-30">
               <span class="mono-xs font-black animate-pulse uppercase tracking-[0.6em] text-primary">Hydrating_Integrity_Chain...</span>
            </div>
         </div>
      </section>

      {/* 3. Event Ledger Chain */}
      <section class="animate-fade-in" style="animation-delay: 200ms;">
        <div class="flex items-center gap-6 mb-10 pb-4 border-b border-white/5">
           <div class="w-12 h-1.5 bg-primary rounded-full shadow-primary"></div>
           <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.4em]">01_EVENT_LEDGER_CHAIN</h2>
        </div>
         <div id="audit-events" class="flex flex-col gap-8">
             <div class="t-panel glass-panel text-center border-dashed border-white/10 opacity-30">
                 <span class="mono-xs font-black animate-pulse uppercase tracking-[0.6em] text-primary">Verifying_Ledger_Integrity...</span>
             </div>
         </div>
      </section>

      <script dangerouslySetInnerHTML={{ __html: `
        const CSRF_TOKEN = ${JSON.stringify(props.csrfToken || '')};
        
        async function loadCompliance() {
            try {
                const res = await fetch('/api/compliance/snapshot', {
                  headers: { 'X-CT-Token': CSRF_TOKEN }
                });
                const data = await res.json();
                const container = document.getElementById('compliance-snapshot');
                if (!container) return;
                
                const postureColor = data.overallStatus === 'COMPLIANT' ? 'border-success' : 'border-danger';
                const statusColor = data.overallStatus === 'COMPLIANT' ? 'text-success' : 'text-danger';
                const tamperColor = data.metrics.tamperAttempts > 0 ? 'border-danger shadow-danger/20' : 'border-slate-800';
                const tamperTextColor = data.metrics.tamperAttempts > 0 ? 'text-danger' : 'text-white';

                container.innerHTML = \`
                    <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 \${postureColor} group">
                        <span class="label">System Posture</span>
                        <div class="value-group mt-4">
                            <span class="value text-3xl \${statusColor} tracking-widest">\${data.overallStatus}</span>
                        </div>
                        <div class="mt-6 pt-6 border-t border-white/5 mono-xs font-black text-slate-600 uppercase tracking-widest">Policy_Check: Passed</div>
                    </div>
                    <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 border-primary group">
                        <span class="label">Integrity Index</span>
                        <div class="value-group mt-4">
                            <span class="value text-5xl tabular-nums tracking-tighter">\${data.integrityScore}</span>
                            <span class="unit text-lg">% Score</span>
                        </div>
                        <div class="mt-6 pt-6 border-t border-white/5 mono-xs font-black text-slate-600 uppercase tracking-widest">Hash_Chain: Valid</div>
                    </div>
                    <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 \${tamperColor} group">
                        <span class="label">Tamper Signals</span>
                        <div class="value-group mt-4">
                            <span class="value text-5xl tabular-nums tracking-tighter \${tamperTextColor}">\${data.metrics.tamperAttempts}</span>
                            <span class="unit text-lg">Attempts</span>
                        </div>
                        <div class="mt-6 pt-6 border-t border-white/5 mono-xs font-black text-slate-600 uppercase tracking-widest">Active_Alerts: \${data.metrics.tamperAttempts}</div>
                    </div>
                    <div class="col-span-12 lg:col-span-3 t-panel glass-panel stat-card border-t-2 border-slate-800 group">
                        <span class="label">Admin Mutations</span>
                        <div class="value-group mt-4">
                            <span class="value text-5xl tabular-nums tracking-tighter">\${data.metrics.adminActions}</span>
                            <span class="unit text-lg">Changes</span>
                        </div>
                        <div class="mt-6 pt-6 border-t border-white/5 mono-xs font-black text-slate-600 uppercase tracking-widest">Authorized_Only</div>
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
              container.innerHTML = '<div class="t-panel glass-panel border-dashed border-white/10 p-40 text-center opacity-40"><span class="mono-xs font-black uppercase tracking-[0.5em] text-slate-500">Audit ledger is currently empty.</span></div>';
              return;
            }

            container.innerHTML = events.map(e => {
              const isCritical = e.severity >= 8;
              const theme = isCritical ? 'danger' : 'primary';
              const color = isCritical ? 'var(--danger)' : 'var(--primary)';
              const timeStr = new Date(e.timestamp).toLocaleString([], {hour12:false, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'});
              
              let actorHtml = '';
              if (e.actor) {
                actorHtml = \`<div class="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-1.5 rounded-full mono-xs text-slate-400 font-black tracking-widest uppercase"><span class="text-success">\${e.actor.id}</span> // \${e.actor.ip}</div>\`;
              }

              return \`
                <div class="t-panel glass-panel border-l-4 animate-fade-in group hover:bg-white/[0.03] transition-all" style="border-left-color: \${color}">
                  <div class="flex justify-between items-start mb-10 pb-8 border-b border-white/5">
                     <div class="flex items-center gap-10">
                        <div class="flex flex-col gap-2">
                           <div class="flex items-center gap-3">
                             <span class="dot active shadow-\${theme} \${isCritical ? 'animate-pulse' : ''}"></span>
                             <span class="mono-xs font-black tracking-[0.3em] uppercase" style="color: \${color}">\${e.type}</span>
                           </div>
                           <h3 class="text-3xl font-black text-white tracking-tighter uppercase leading-none mt-3 group-hover:text-primary transition-colors">\${e.message}</h3>
                        </div>
                     </div>
                     <div class="text-right flex flex-col items-end gap-2">
                        <div class="mono-xs text-slate-500 font-black uppercase tracking-[0.2em] tabular-nums">\${timeStr}</div>
                        \${actorHtml}
                     </div>
                  </div>

                  <div class="grid grid-cols-12 gap-10 items-center">
                     <div class="col-span-12 lg:col-span-9">
                        <div class="flex items-center gap-4 mb-4">
                           <div class="w-10 h-0.5 bg-slate-800 rounded"></div>
                           <span class="mono-xs font-black text-slate-600 uppercase tracking-widest">Cryptographic_Hash_Chain_Verification</span>
                        </div>
                        <div class="mono-xs p-6 bg-black/50 rounded-xl border border-white/5 text-primary/60 break-all font-bold tracking-widest select-all leading-relaxed shadow-inner">\${e.hash}</div>
                     </div>
                     <div class="col-span-12 lg:col-span-3 flex justify-end">
                        \${e.hwSignature ? \`
                        <div class="flex items-center gap-4 px-8 py-4 bg-success/10 border border-success/30 rounded-xl text-success shadow-success/15 group-hover:scale-105 transition-transform duration-500">
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
                           <span class="mono-xs font-black uppercase tracking-[0.3em]">Hardware_Verified</span>
                        </div>
                        \` : \`
                        <div class="flex items-center gap-4 px-8 py-4 bg-white/[0.03] border border-white/10 rounded-xl text-slate-500 group-hover:text-slate-400 transition-colors">
                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="opacity-50"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                           <span class="mono-xs font-black uppercase tracking-[0.3em]">Software_Signed</span>
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
              a.download = 'ghost-compliance-export-' + new Date().toISOString().split('T')[0] + '.json';
              a.click();
            } catch(e) { alert("Export failed: " + e.message); }
        }

        document.getElementById('export-btn').onclick = exportBundle;
        loadCompliance();
        loadAudit();
      ` }} />
    </Layout>
  );
};
