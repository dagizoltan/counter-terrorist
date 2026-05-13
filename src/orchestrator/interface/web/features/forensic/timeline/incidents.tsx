import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

/**
 * Atomic Incidents Page
 * Hardened incident response portal with CSS-driven design system.
 */
export const IncidentsPage = (props: { csrfToken?: string, nonce?: string }) => {
  const scriptContent = `
    async function loadIncidents() {
      try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
        const res = await fetch('/api/compliance/incidents', {
          headers: csrfToken ? { 'X-CT-Token': csrfToken } : {}
        });
        const incidents = await res.json();
        const container = document.getElementById('incidents-container');
        if (!container) return;
        
        if (!incidents || incidents.length === 0) {
            container.innerHTML = \`
              <div class="t-panel glass-panel text-center p-32 border-dashed opacity-30">
                 <span class="mono-xs font-black uppercase tracking-widest text-slate-500 italic">No_Active_Security_Incidents_In_Log</span>
              </div>
            \`;
            return;
        }

        container.innerHTML = incidents.map(i => {
            const isCritical = i.severity === 'CRITICAL';
            const statusTheme = i.status === 'OPEN' ? 'danger' : 'success';

            return \`
                <div class="t-panel glass-panel mb-8 group hover:bg-white/[0.02] border-l-4 \${isCritical ? 'border-danger' : 'border-primary'}">
                    <div class="flex justify-between items-start mb-8 pb-6 border-b border-white/5">
                        <div class="flex items-center gap-4">
                            <div class="w-16 h-16 flex items-center justify-center bg-black/60 border border-white/10 rounded">
                                <span class="dot \${i.status === 'OPEN' ? 'danger' : 'active'}"></span>
                            </div>
                            <div>
                                <h3 class="text-3xl font-black text-white mb-2 italic tracking-tighter uppercase">\${window.escapeHTML(i.title)}</h3>
                                <div class="flex items-center gap-6">
                                    <div class="flex items-center gap-2">
                                       <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Case_ID:</span>
                                       <span class="mono-xs font-black text-primary select-all">\${window.escapeHTML(i.id.slice(0,12))}</span>
                                    </div>
                                    <span class="text-slate-800 font-bold opacity-30">//</span>
                                    <div class="flex items-center gap-2">
                                       <span class="mono-xs text-slate-600 font-bold uppercase tracking-widest">Source_Vector:</span>
                                       <span class="mono-xs font-black text-white">\${window.escapeHTML(i.source)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="text-right">
                            <div class="status-pill \${statusTheme} text-[10px] mb-3\${statusTheme}">\${window.escapeHTML(i.status)}</div>
                            <div class="mono-xs font-black text-slate-600 uppercase tracking-widest tabular-nums">\${new Date(i.timestamp).toLocaleString([], {hour12:false})}</div>
                        </div>
                    </div>

                    <div class="p-8 bg-black/60 border border-white/5 rounded-lg mb-8 text-sm text-slate-400 leading-relaxed font-bold uppercase tracking-tight">
                      \${window.escapeHTML(i.description)}
                    </div>

                    <div class="flex justify-between items-center pt-6 border-t border-white/5">
                        <div class="flex gap-3">
                            \${i.indicators.map(ind => \`<span class="mono-xs font-black text-primary/60 uppercase tracking-widest p-3 bg-primary/5 border border-primary/10 rounded">\${window.escapeHTML(ind)}</span>\`).join('')}
                        </div>
                        <div class="flex gap-4">
                            <button onclick="updateStatus('\${i.id}', 'INVESTIGATING')" class="t-btn py-3 px-6 text-[10px]">Investigate_Vector</button>
                            <button onclick="updateStatus('\${i.id}', 'RESOLVED')" class="t-btn success py-3 px-6 text-[10px]">Resolve_Case_File</button>
                        </div>
                    </div>
                </div>
            \`;
        }).join('');
      } catch (err) { console.error("Incidents fetch failed", err); }
    }

    async function updateStatus(id, status) {
       const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
       await fetch(\`/api/compliance/incidents/\${id}/status\`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-CT-Token': csrfToken || ''
          },
          body: JSON.stringify({ status })
       });
       loadIncidents();
    }

    loadIncidents();
  \`;

  return (
    <Layout nonce={props.nonce} title="Security Incidents // Response Management" csrfToken={props.csrfToken} >
      {/* 1. Header Section */}
      <header class="flex justify-between items-end mb-12">
        <div class="flex items-center gap-4">
          <div class="w-3 h-16 bg-danger rounded"></div>
          <div class="flex flex-col gap-2">
            <h1 class="text-6xl font-black text-white tracking-tighter leading-none m-0 uppercase italic">Security_Incidents</h1>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-2">
                <span class="dot danger"></span>
                <span class="mono-xs font-black text-danger tracking-widest uppercase">THREAT_RESPONSE_ACTIVE</span>
              </div>
              <span class="text-slate-700">/</span>
              <div class="mono-xs font-bold text-slate-500 tracking-widest uppercase">LIFECYCLE: ACTIVE_MONITORING</div>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Active Case Files */}
      <section class="mb-12" >
        <h2 class="mono-xs font-black text-slate-500 uppercase tracking-[0.3em] mb-8 pb-4 border-b border-white/5">01_ACTIVE_CASE_FILES</h2>
        <div class="flex flex-col gap-6" id="incidents-container">
           <div class="t-panel glass-panel text-center p-32 border-dashed opacity-30">
              <span class="mono-xs font-black text-primary uppercase tracking-[0.4em]">Syncing_Incident_Reports...</span>
           </div>
        </div>
      </section>

      <script dangerouslySetInnerHTML={{ __html: scriptContent }} />
    </Layout>
  );
};
