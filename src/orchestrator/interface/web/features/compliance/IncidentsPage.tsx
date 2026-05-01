import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const IncidentsPage = () => {
  return (
    <Layout title="Security Incidents // Response Management">
      <div class="p-12">
        <div class="mb-12">
          <h1 class="text-3xl font-black tracking-widest uppercase mb-2">Security_Incidents</h1>
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Incident Lifecycle Management // Active Investigations</p>
        </div>

        <div class="grid grid-cols-1 gap-6" id="incidents-container">
           <div class="glass-panel p-8 rounded-2xl animate-pulse text-center text-slate-500 font-black uppercase text-[10px] tracking-widest">
              Syncing Incident Reports...
           </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          async function loadIncidents() {
            const res = await fetch('/api/compliance/incidents');
            const incidents = await res.json();
            const container = document.getElementById('incidents-container');
            
            if (incidents.length === 0) {
              container.innerHTML = '<div class="glass-panel p-12 rounded-2xl text-center text-slate-500 font-black uppercase text-[10px] tracking-widest border border-white/5">No active security incidents reported.</div>';
              return;
            }

            container.innerHTML = incidents.map(i => \`
              <div class="glass-panel p-8 rounded-2xl border border-white/5 flex flex-col hover:border-danger/10 transition-all">
                <div class="flex justify-between items-start mb-6">
                   <div class="flex items-center gap-4">
                      <div class="w-3 h-3 rounded-full \${i.severity === 'CRITICAL' ? 'bg-danger animate-ping' : 'bg-warning'}"></div>
                      <div>
                         <h3 class="text-xl font-black text-white tracking-wide mb-1 uppercase">\${i.title}</h3>
                         <div class="flex items-center gap-4">
                            <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">ID: \${i.id.slice(0, 8)}</span>
                            <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest">Source: \${i.source}</span>
                         </div>
                      </div>
                   </div>
                   <div class="flex flex-col items-end">
                      <span class="px-3 py-1 rounded bg-slate-800 text-[9px] font-black \${i.status === 'OPEN' ? 'text-danger' : 'text-success'} uppercase tracking-widest mb-2">\${i.status}</span>
                      <span class="text-[9px] font-bold text-slate-600 uppercase tracking-widest">\${new Date(i.timestamp).toLocaleString()}</span>
                   </div>
                </div>
                
                <p class="text-sm text-slate-400 mb-6 leading-relaxed bg-black/20 p-4 rounded-xl border border-white/5">\${i.description}</p>
                
                <div class="flex justify-between items-center">
                   <div class="flex gap-2">
                      \${i.indicators.map(ind => \`
                         <span class="px-2 py-0.5 rounded bg-danger/5 border border-danger/10 text-[8px] font-black text-danger uppercase tracking-widest">\${ind}</span>
                      \`).join('')}
                   </div>
                   <div class="flex gap-2">
                      <button onclick="updateStatus('\${i.id}', 'INVESTIGATING')" class="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-[8px] font-black text-slate-300 uppercase tracking-widest transition-all">Investigate</button>
                      <button onclick="updateStatus('\${i.id}', 'RESOLVED')" class="px-4 py-2 bg-success/10 hover:bg-success text-success hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all">Resolve</button>
                   </div>
                </div>
              </div>
            \`).join('');
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
        ` }} />
      </div>
    </Layout>
  );
};
