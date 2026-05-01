import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const IdentifiedPage = () => {
  return (
    <Layout title="Identified Threats // Reputation Database">
      <div class="p-12">
        <div class="flex justify-between items-start mb-12">
          <div>
            <h1 class="text-3xl font-black tracking-widest uppercase mb-2">Identified_Threats</h1>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Local Reputation Cache // Weighted Intel</p>
          </div>
          <div class="flex gap-4">
             <button id="sync-btn" class="px-6 py-3 bg-cyber/10 hover:bg-cyber border border-cyber/30 hover:text-white text-cyber rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Force_Sync
             </button>
             <button id="wipe-btn" class="px-6 py-3 bg-danger/10 hover:bg-danger border border-danger/30 hover:text-white text-danger rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                Wipe_Database
             </button>
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4" id="threats-list">
           <div class="glass-panel p-8 rounded-2xl animate-pulse text-center text-slate-500 font-black uppercase text-[10px] tracking-widest">
              Querying Reputation Database...
           </div>
        </div>

        <script dangerouslySetInnerHTML={{ __html: `
          async function loadThreats() {
            const res = await fetch('/api/threats/identified');
            const threats = await res.json();
            const container = document.getElementById('threats-list');
            
            if (threats.length === 0) {
              container.innerHTML = '<div class="glass-panel p-12 rounded-2xl text-center text-slate-500 font-black uppercase text-[10px] tracking-widest border border-white/5">Database is currently empty. Synchronize with external providers to hydrate.</div>';
              return;
            }

            container.innerHTML = threats.map(t => \`
              <div class="glass-panel p-6 rounded-2xl border border-white/5 flex items-center justify-between group hover:border-danger/20 transition-all">
                <div class="flex items-center gap-6">
                  <div class="w-12 h-12 rounded-xl bg-danger/10 border border-danger/20 flex items-center justify-center">
                    <div class="w-2 h-2 bg-danger rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)]"></div>
                  </div>
                  <div>
                    <div class="flex items-center gap-3 mb-1">
                      <span class="text-lg font-black text-white tracking-wide">\${t.indicator}</span>
                      <span class="px-2 py-0.5 rounded bg-slate-800 text-[8px] font-black text-slate-400 uppercase tracking-widest">\${t.type}</span>
                    </div>
                    <div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                      Provider: <span class="text-slate-300">\${t.provider}</span> | 
                      Threat: <span class="text-danger/70">\${t.threatType}</span>
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-12">
                   <div class="text-right">
                      <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Confidence_Score</div>
                      <div class="text-xl font-black \${t.score > 80 ? 'text-danger' : 'text-warning'} italic">\${t.score}%</div>
                   </div>
                   <div class="text-right w-32">
                      <div class="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Last_Seen</div>
                      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">\${new Date(t.lastSeen).toLocaleDateString()}</div>
                   </div>
                </div>
              </div>
            \`).join('');
          }

          document.getElementById('sync-btn').addEventListener('click', async () => {
             const btn = document.getElementById('sync-btn');
             btn.disabled = true;
             btn.innerText = 'SYNCING...';
             await fetch('/api/threats/identified/sync', { method: 'POST' });
             await loadThreats();
             btn.disabled = false;
             btn.innerText = 'Force_Sync';
          });

          document.getElementById('wipe-btn').addEventListener('click', async () => {
             if (!confirm('This will purge the local reputation cache. Continue?')) return;
             await fetch('/api/threats/identified/wipe', { method: 'POST' });
             await loadThreats();
          });

          loadThreats();
        ` }} />
      </div>
    </Layout>
  );
};
