import { jsx } from "hono/jsx";
import { Layout } from "@interface/components/Layout.tsx";

export const IdentifiedPage = () => {
  return (
    <Layout title="Identified Threats // Reputation Database">
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-12 gap-6">
        <div>
          <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
            <span class="w-2 h-10 bg-danger rounded-full"></span>
            IDENTIFIED_THREATS
          </h1>
          <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Local Reputation Cache // Weighted Intelligence Database</p>
        </div>
        <div class="flex gap-4 w-full md:w-auto">
           <button id="sync-btn" class="flex-grow md:flex-none px-8 py-3 bg-cyber/10 hover:bg-cyber/20 border border-cyber/30 text-cyber rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(14,165,233,0.1)]">
              Force_Sync
           </button>
           <button id="wipe-btn" class="flex-grow md:flex-none px-8 py-3 bg-danger/10 hover:bg-danger/20 border border-danger/30 text-danger rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(239,68,68,0.1)]">
              Wipe_Database
           </button>
        </div>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_REPUTATION_CACHE
        </h2>
        <div class="grid grid-cols-1 gap-4" id="threats-list">
           <div class="glass-panel p-12 rounded-3xl animate-pulse text-center text-slate-500 font-black uppercase text-[11px] tracking-widest italic opacity-50 border border-white/5">
              Querying_Reputation_Database...
           </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function loadThreats() {
          const res = await fetch('/api/threats/identified');
          const threats = await res.json();
          const container = document.getElementById('threats-list');
          
          if (threats.length === 0) {
            container.innerHTML = '<div class="glass-panel p-12 rounded-3xl text-center text-slate-500 font-black uppercase text-[11px] tracking-widest italic opacity-50 border border-white/5">Database is currently empty. Synchronize with external providers to hydrate.</div>';
            return;
          }

          container.innerHTML = threats.map(t => \`
            <div class="glass-panel p-8 rounded-3xl border border-white/5 flex flex-col md:flex-row items-center justify-between group hover:border-danger/30 transition-all relative overflow-hidden">
              <div class="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-danger"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              </div>
              <div class="flex items-center gap-8 w-full">
                <div class="w-16 h-16 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center shrink-0">
                  <div class="w-3 h-3 bg-danger rounded-full shadow-[0_0_15px_rgba(239,68,68,0.6)] animate-pulse"></div>
                </div>
                <div class="flex-grow min-w-0">
                  <div class="flex flex-wrap items-center gap-4 mb-2">
                    <span class="text-2xl font-black text-white tracking-tighter truncate">\${t.indicator}</span>
                    <span class="px-3 py-1 rounded-full bg-slate-800 text-[9px] font-black text-slate-400 uppercase tracking-widest border border-white/5">\${t.type}</span>
                  </div>
                  <div class="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] flex flex-wrap gap-x-4">
                    <span>Provider: <span class="text-slate-300">\${t.provider}</span></span>
                    <span>Threat: <span class="text-danger/70 font-black italic">\${t.threatType}</span></span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-12 mt-6 md:mt-0 w-full md:w-auto shrink-0">
                 <div class="text-right">
                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Confidence_Score</div>
                    <div class="text-3xl font-black \${t.score > 80 ? 'text-danger' : 'text-warning'} italic tracking-tighter font-mono">\${t.score}%</div>
                 </div>
                 <div class="text-right w-32 border-l border-white/5 pl-8">
                    <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Last_Seen</div>
                    <div class="text-[11px] font-black text-slate-300 uppercase tracking-tighter font-mono">\${new Date(t.lastSeen).toLocaleDateString()}</div>
                 </div>
              </div>
            </div>
          \`).join('');
        }

        document.getElementById('sync-btn').addEventListener('click', async () => {
           const btn = document.getElementById('sync-btn');
           btn.disabled = true;
           const originalText = btn.innerText;
           btn.innerText = 'SYNCING...';
           await fetch('/api/threats/identified/sync', { method: 'POST' });
           await loadThreats();
           btn.disabled = false;
           btn.innerText = originalText;
        });

        document.getElementById('wipe-btn').addEventListener('click', async () => {
           if (!confirm('This will purge the local reputation cache. Continue?')) return;
           await fetch('/api/threats/identified/wipe', { method: 'POST' });
           await loadThreats();
        });

        loadThreats();
      ` }} />
    </Layout>
  );
};
