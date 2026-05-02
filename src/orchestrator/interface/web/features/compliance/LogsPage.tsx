import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const LogsPage = () => {
  return (
    <Layout title="System Logs // Forensic Audit">
      <div class="mb-12">
        <h1 class="text-4xl font-black tracking-tighter uppercase mb-2 flex items-center gap-4">
          <span class="w-2 h-10 bg-cyber rounded-full"></span>
          SYSTEM_LOGS
        </h1>
        <p class="text-slate-500 text-xs font-bold tracking-[0.4em] uppercase ml-6">Orchestrator Internal Execution Stream // Global_Live_Audit</p>
      </div>

      <div class="mb-12">
        <h2 class="text-[11px] font-black uppercase tracking-[0.5em] text-slate-500 mb-6 flex items-center gap-3">
          <span class="w-8 h-px bg-slate-800"></span>
          01_LIVE_EXECUTION_BUFFER
        </h2>
        <div class="glass-panel rounded-3xl border border-white/5 bg-black/60 relative overflow-hidden group hover:border-white/10 transition-all">
           <div class="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
           </div>
           <div class="p-10">
              <pre id="log-viewer" class="font-mono text-[12px] leading-relaxed text-slate-400 overflow-x-auto h-[700px] custom-scrollbar p-6 whitespace-pre-wrap selection:bg-cyber selection:text-white">
                 Initializing_Secure_Stream_Access...
              </pre>
           </div>
           <div class="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: `
        async function loadLogs() {
          const res = await fetch('/api/compliance/logs');
          const text = await res.text();
          const viewer = document.getElementById('log-viewer');
          viewer.innerText = text;
          viewer.scrollTop = viewer.scrollHeight;
        }
        loadLogs();
        setInterval(loadLogs, 5000);
      ` }} />
    </Layout>
  );
};
