import { jsx } from "hono/jsx";
import { Layout } from "../../components/Layout.tsx";

export const LogsPage = () => {
  return (
    <Layout title="System Logs // Forensic Audit">
      <div class="p-12">
        <div class="mb-12">
          <h1 class="text-3xl font-black tracking-widest uppercase mb-2">System_Logs</h1>
          <p class="text-xs font-bold text-slate-500 uppercase tracking-widest">Orchestrator Internal Execution Stream // LIVE</p>
        </div>

        <div class="glass-panel p-6 rounded-2xl border border-white/5 bg-black/40">
           <pre id="log-viewer" class="font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto h-[600px] custom-scrollbar p-4 whitespace-pre-wrap">
              Initializing Secure Stream Access...
           </pre>
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
      </div>
    </Layout>
  );
};
